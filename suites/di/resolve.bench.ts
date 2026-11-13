import { Container, Injectable, InjectableScopes } from '@axisparkjs/di';
import { defineSuite } from '../../runner/define-suite';

@Injectable()
class SingletonService {}

@Injectable()
class Level1 {}
@Injectable()
class Level2 {
    constructor(readonly level: Level1) {}
}
@Injectable()
class Level3 {
    constructor(readonly level: Level2) {}
}
@Injectable()
class Level4 {
    constructor(readonly level: Level3) {}
}
@Injectable()
class DeepService {
    constructor(readonly level: Level4) {}
}

@Injectable()
class ScopedService {
    constructor(readonly level: Level1) {}
}

/** The same tree built by hand: the cost of the objects without the container. */
function deepServiceManual(): DeepService {
    return new DeepService(new Level4(new Level3(new Level2(new Level1()))));
}

/** 100 providers in the container, like a medium application. */
const FILLERS = Array.from({ length: 100 }, (_, index) => {
    const cls = class {};
    Object.defineProperty(cls, 'name', { value: `Filler${index}` });
    Injectable()(cls);
    return cls;
});

function container(): Container {
    const container = new Container();
    for (const filler of FILLERS) container.bind(filler);
    container.bind(SingletonService);
    for (const cls of [Level1, Level2, Level3, Level4, DeepService]) container.bind({ token: cls, useClass: cls, scope: InjectableScopes.Transient });
    container.bind({ token: ScopedService, useClass: ScopedService, scope: InjectableScopes.Scoped });
    return container;
}

export default defineSuite({
    package: '@axisparkjs/di',
    id: 'di.resolve',
    version: 1,
    tier: 'micro',
    description: 'Resolves providers from a container with 100 providers.',
    baseline: { singleton: 'raw-new', 'transient-depth-5': 'raw-new', scoped: 'raw-new' },
    setup: async () => {
        const ctx = { container: container() };
        await ctx.container.resolve(SingletonService);
        return ctx;
    },
    tasks: {
        singleton: (ctx) => ctx.container.resolve(SingletonService),
        'transient-depth-5': (ctx) => ctx.container.resolve(DeepService),
        scoped: (ctx) => ctx.container.resolve(ScopedService, ctx.container.createScopedContainer()),
        'raw-new': () => deepServiceManual()
    }
});
