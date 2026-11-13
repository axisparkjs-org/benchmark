import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, Server } from '@modelcontextprotocol/server';
import { IsInt, IsString, Max, Min, validate } from 'class-validator';
import { Pipe, ValidateSchema } from '@axisparkjs/engine';
import { MCP_SERVER, McpArgs, McpPlugin, McpPluginOptionsFactory, McpServer, McpTool, type McpServerBuilder } from '@axisparkjs/mcp';
import { createApp } from '../../fixtures/app';
import { defineSuite } from '../../runner/define-suite';

class SearchUsers {
    @IsString()
    query: string;

    @IsInt()
    @Min(1)
    @Max(100)
    limit: number;
}

const USERS = Array.from({ length: 50 }, (_, index) => ({ id: `u-${index}`, name: `User ${index}` }));

function search(args: SearchUsers) {
    return USERS.filter((user) => user.name.includes(args.query)).slice(0, args.limit);
}

@McpServer({ prefix: 'users' })
class UsersMcp {
    @McpTool('search', { description: 'Search users by name' })
    search(@McpArgs() @Pipe(ValidateSchema()) args: SearchUsers) {
        return search(args);
    }

    @McpTool('count', { description: 'Count the users' })
    count() {
        return { count: USERS.length };
    }
}
void UsersMcp;

/** The same tools with the MCP SDK alone: a low-level server, like the one the plugin builds. */
function rawServer(): Server {
    const server = new Server({ name: 'raw', version: '1.0.0' }, { capabilities: { tools: {} } });
    const inputSchema = {
        type: 'object' as const,
        properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } },
        required: ['query', 'limit']
    };
    server.setRequestHandler('tools/list', async () => ({
        tools: [
            { name: 'users_search', description: 'Search users by name', inputSchema },
            { name: 'users_count', description: 'Count the users', inputSchema: { type: 'object' as const } }
        ]
    }));
    server.setRequestHandler('tools/call', async (request) => {
        const { name, arguments: args } = request.params;
        if (name === 'users_count') return { content: [{ type: 'text' as const, text: JSON.stringify({ count: USERS.length }) }] };
        const valid = await validArgs(args);
        if (!valid) return { content: [{ type: 'text' as const, text: 'Invalid arguments' }], isError: true };
        return { content: [{ type: 'text' as const, text: JSON.stringify(search(valid)) }] };
    });
    return server;
}

async function validArgs(args: unknown): Promise<SearchUsers | undefined> {
    const instance = Object.assign(Object.create(SearchUsers.prototype), args) as SearchUsers;
    return (await validate(instance)).length ? undefined : instance;
}

async function connect(server: Server): Promise<Client> {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'bench', version: '1.0.0' });
    await client.connect(clientTransport as never);
    return client;
}

interface Ctx {
    app: { destroy(): Promise<void> };
    clients: Client[];
    axispark: Client;
    raw: Client;
    names: { search: string; count: string };
}

const ARGS = { query: 'User 1', limit: 5 };

export default defineSuite<Ctx>({
    package: '@axisparkjs/mcp',
    id: 'mcp.tools',
    version: 1,
    tier: 'app',
    description: 'Lists and calls tools over the in-memory transport of the MCP SDK.',
    baseline: { 'call-search': 'raw-call-search', 'list-tools': 'raw-list-tools' },
    setup: async () => {
        // init() generates the definitions and configures the server; the HTTP transport only starts with run().
        const app = createApp({ plugins: [[McpPlugin, McpPluginOptionsFactory.create({ transport: 'http', path: '/mcp', port: 0 })]] });
        await app.init();
        const builder = (await app.get(MCP_SERVER)) as McpServerBuilder;
        const axispark = await connect(builder.build('http'));
        const raw = await connect(rawServer());

        const { tools } = await axispark.listTools();
        const names = { search: tools.find((t) => t.name.endsWith('search'))!.name, count: tools.find((t) => t.name.endsWith('count'))!.name };
        const result = await axispark.callTool({ name: names.search, arguments: ARGS });
        if (result.isError) throw new Error(`The tool failed: ${JSON.stringify(result.content)}`);
        if ((await raw.callTool({ name: 'users_search', arguments: ARGS })).isError) throw new Error('The raw tool failed');
        return { app, clients: [axispark, raw], axispark, raw, names };
    },
    tasks: {
        'list-tools': (ctx) => ctx.axispark.listTools(),
        'call-search': (ctx) => ctx.axispark.callTool({ name: ctx.names.search, arguments: ARGS }),
        'call-no-args': (ctx) => ctx.axispark.callTool({ name: ctx.names.count, arguments: {} }),
        'raw-list-tools': (ctx) => ctx.raw.listTools(),
        'raw-call-search': (ctx) => ctx.raw.callTool({ name: 'users_search', arguments: ARGS })
    },
    teardown: async (ctx) => {
        for (const client of ctx.clients) await client.close();
        await ctx.app.destroy();
    }
});
