import { ParameterGenerator } from '@axisparkjs/engine';
import { Body, Controller, Post } from '@axisparkjs/http';
import { OpenApiDocumentGenerator, OpenApiPlugin, OpenApiPluginOptionsFactory, OpenApiProperty, OpenApiResponse, OpenApiSchema, type OpenApiPluginOptions } from '@axisparkjs/openapi';
import { ClassGroups, createApp } from '../../fixtures/app';
import { syntheticControllers } from '../../fixtures/controllers';
import { memoryAdapter, memoryHttpPlugin } from '../../fixtures/http';
import { defineSuite } from '../../runner/define-suite';
import type { RouteDefinition } from '@axisparkjs/http';

@OpenApiSchema()
class Todo {
    @OpenApiProperty()
    task: string;

    @OpenApiProperty()
    done: boolean;
}

@Controller('todos')
class TodoController {
    @Post()
    @OpenApiResponse({ statusCode: 201, type: Todo, description: 'The created todo' })
    create(@Body() todo: Todo): Todo {
        return todo;
    }
}

const groups = new ClassGroups();
groups.add('10', [...syntheticControllers(9).controllers, TodoController]);
groups.add('500', [...syntheticControllers(499).controllers, TodoController]);

const options: OpenApiPluginOptions = OpenApiPluginOptionsFactory.create({ info: { title: 'Bench API', version: '1.0.0' } });

async function routesOf(group: string) {
    groups.only(group);
    const app = createApp({ plugins: [memoryHttpPlugin(), [OpenApiPlugin, options]] });
    await app.init();
    const routes = (await memoryAdapter(app)).getRegisteredRoutes();
    return { app, routes };
}

interface Ctx {
    apps: { destroy(): Promise<void> }[];
    parameters: ParameterGenerator;
    routes10: readonly RouteDefinition[];
    routes500: readonly RouteDefinition[];
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/openapi',
    id: 'openapi.document',
    version: 1,
    tier: 'micro',
    description: 'Generates the OpenAPI document of 10 and 500 routes and serializes it.',
    setup: async () => {
        const r10 = await routesOf('10');
        const r500 = await routesOf('500');
        return { apps: [r10.app, r500.app], parameters: await r10.app.get(ParameterGenerator), routes10: r10.routes, routes500: r500.routes };
    },
    tasks: {
        'generate-10': (ctx) => new OpenApiDocumentGenerator(options, ctx.parameters).generate(ctx.routes10),
        'generate-500': (ctx) => new OpenApiDocumentGenerator(options, ctx.parameters).generate(ctx.routes500),
        'json-500': (ctx) => new OpenApiDocumentGenerator(options, ctx.parameters).generate(ctx.routes500).toJson(),
        'yaml-500': (ctx) => new OpenApiDocumentGenerator(options, ctx.parameters).generate(ctx.routes500).toYaml()
    },
    teardown: async (ctx) => {
        for (const app of ctx.apps) await app.destroy();
    }
});
