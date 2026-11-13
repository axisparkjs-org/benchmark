import { InMemoryCacheStore, InMemoryLockStore, InMemoryRateLimitStore, MemoryStore } from '@axisparkjs/store';
import { Container } from '@axisparkjs/di';
import { Logger } from '@axisparkjs/logger';
import { nullTransports } from '../../fixtures/app';
import { defineSuite } from '../../runner/define-suite';

const KEYS = Array.from({ length: 1000 }, (_, index) => `key:${index}`);

export default defineSuite({
    package: '@axisparkjs/store',
    id: 'store.memory',
    version: 1,
    tier: 'micro',
    description: 'In-memory stores, the default of every feature, with 1,000 keys.',
    baseline: { 'cache-get': 'raw-map-get', 'cache-set': 'raw-map-set' },
    setup: async () => {
        const cache = new InMemoryCacheStore();
        const map = new Map<string, { value: unknown; expiresAt: number }>();
        for (const key of KEYS) {
            await cache.set(key, { key }, 60_000);
            map.set(key, { value: { key }, expiresAt: Date.now() + 60_000 });
        }
        const context = { container: new Container(), logger: new Logger(nullTransports()) };
        return { cache, map, rateLimit: new InMemoryRateLimitStore(), lock: new InMemoryLockStore(), provider: MemoryStore(), context, i: 0 };
    },
    tasks: {
        'cache-get': (ctx) => ctx.cache.get(KEYS[ctx.i++ % KEYS.length]),
        'cache-set': (ctx) => ctx.cache.set(KEYS[ctx.i++ % KEYS.length], { updated: true }, 60_000),
        'rate-limit-consume': (ctx) => ctx.rateLimit.consume(KEYS[ctx.i++ % KEYS.length], { ttl: 60_000, limit: 1_000_000 }),
        'lock-acquire-release': async (ctx) => {
            const lock = await ctx.lock.acquire(KEYS[ctx.i++ % KEYS.length], 60_000);
            await lock?.release();
        },
        // Every plugin asks the provider for its store: the instances are shared between them.
        'provider-shared': async (ctx) => {
            await ctx.provider('cache', ctx.context);
            await ctx.provider('rate-limit', ctx.context);
            await ctx.provider('lock', ctx.context);
        },
        'raw-map-get': (ctx) => {
            const entry = ctx.map.get(KEYS[ctx.i++ % KEYS.length]);
            return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
        },
        'raw-map-set': (ctx) => ctx.map.set(KEYS[ctx.i++ % KEYS.length], { value: { updated: true }, expiresAt: Date.now() + 60_000 })
    }
});
