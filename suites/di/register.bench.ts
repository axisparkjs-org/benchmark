import { Container, Injectable, InjectableScopes } from '@axisparkjs/di';
import { defineSuite } from '../../runner/define-suite';

const PROVIDERS = Array.from({ length: 1000 }, (_, index) => {
    const cls = class {};
    Object.defineProperty(cls, 'name', { value: `Provider${index}` });
    Injectable()(cls);
    return cls;
});

export default defineSuite({
    package: '@axisparkjs/di',
    id: 'di.register',
    version: 1,
    tier: 'micro',
    description: 'Registers 1,000 providers in a new container.',
    baseline: 'raw-map',
    tasks: {
        'providers-1000': () => {
            const container = new Container();
            for (const provider of PROVIDERS) container.bind({ token: provider, useClass: provider, scope: InjectableScopes.Singleton });
            return container;
        },
        'raw-map': () => {
            const map = new Map<unknown, unknown>();
            for (const provider of PROVIDERS) map.set(provider, { token: provider, useClass: provider, scope: InjectableScopes.Singleton });
            return map;
        }
    }
});
