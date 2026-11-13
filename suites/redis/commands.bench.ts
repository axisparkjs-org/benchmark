import { createClient, type RedisClientType } from 'redis';
import { RedisConnectionManager, RedisPlugin, RedisPluginOptionsFactory, RedisStore } from '@axisparkjs/redis';
import type { CacheStore } from '@axisparkjs/store';
import { createAppWithContext } from '../../fixtures/app';
import { infra, waitFor } from '../../fixtures/infra';
import { defineSuite } from '../../runner/define-suite';

interface Ctx {
    app: { destroy(): Promise<void> };
    connection: RedisClientType;
    store: CacheStore;
    raw: RedisClientType;
}

const VALUE = { id: 'u-1', name: 'Ada', roles: ['admin'] };
const JSON_VALUE = JSON.stringify(VALUE);

export default defineSuite<Ctx>({
    package: '@axisparkjs/redis',
    id: 'redis.commands',
    version: 1,
    tier: 'infra',
    description: 'GET and SET through the connection of the plugin and its cache store, and with the redis client alone.',
    baseline: { 'connection-get': 'raw-get', 'connection-set': 'raw-set', 'store-get': 'raw-get', 'store-set': 'raw-set' },
    setup: async () => {
        const { app, context } = createAppWithContext({ plugins: [[RedisPlugin, RedisPluginOptionsFactory.create({ connections: [{ name: 'BENCH', url: infra.redis }] })]] });
        await app.init();
        await app.run();
        const connection = (await app.get(RedisConnectionManager)).getConnection('BENCH') as RedisClientType;
        await waitFor(() => connection.isReady, 'Redis');
        const store = (await RedisStore('BENCH', { prefix: 'bench:' })('cache', context)) as CacheStore;

        const raw = createClient({ url: infra.redis }) as RedisClientType;
        await raw.connect();

        await connection.set('bench:connection', JSON_VALUE);
        await store.set('store', VALUE, 60_000);
        await raw.set('bench:raw', JSON_VALUE);
        if (JSON.stringify(await store.get('store')) !== JSON_VALUE) throw new Error('The cache store did not return the value');
        return { app, connection, store, raw };
    },
    tasks: {
        'connection-get': (ctx) => ctx.connection.get('bench:connection'),
        'connection-set': (ctx) => ctx.connection.set('bench:connection', JSON_VALUE),
        'store-get': (ctx) => ctx.store.get('store'),
        'store-set': (ctx) => ctx.store.set('store', VALUE, 60_000),
        'raw-get': (ctx) => ctx.raw.get('bench:raw'),
        'raw-set': (ctx) => ctx.raw.set('bench:raw', JSON_VALUE)
    },
    teardown: async (ctx) => {
        await ctx.raw.quit();
        await ctx.app.destroy();
    }
});
