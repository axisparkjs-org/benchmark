import { Check, ExecutionTransport, Guard, Pipe, Use, ValidateSchema, Interceptor, Before } from '@axisparkjs/engine';
import { Injectable } from '@axisparkjs/di';
import { IsEmail, IsInt, IsString, Max, Min, validate } from 'class-validator';
import { createAppWithContext } from '../../fixtures/app';
import { BenchExecutor, Input } from '../../fixtures/engine';
import { defineSuite } from '../../runner/define-suite';

class CreateUser {
    @IsString()
    name: string;

    @IsEmail()
    email: string;

    @IsInt()
    @Min(18)
    @Max(130)
    age: number;
}

@Guard({ transport: ExecutionTransport.Other, global: false })
class AllowGuard {
    @Check()
    check(@Input() input: { allowed?: boolean }): void {
        if (input && input.allowed === false) throw new Error('Forbidden');
    }
}

@Guard({ transport: ExecutionTransport.Other, global: false })
class SecondGuard {
    @Check()
    check(): void {}
}

@Interceptor({ transport: ExecutionTransport.Other, global: false })
class TimingInterceptor {
    @Before()
    before(): void {}
}

@Injectable()
class UserHandler {
    bare() {
        return { ok: true };
    }

    @Use(AllowGuard)
    guarded(@Input() input: unknown) {
        return input;
    }

    validated(@Input() @Pipe(ValidateSchema()) input: CreateUser) {
        return input;
    }

    @Use(AllowGuard, SecondGuard, TimingInterceptor)
    full(@Input() @Pipe(ValidateSchema()) input: CreateUser) {
        return input;
    }
}

const user = { name: 'Ada', email: 'ada@example.com', age: 36, allowed: true };

export default defineSuite({
    package: '@axisparkjs/engine',
    id: 'engine.pipeline',
    version: 1,
    tier: 'micro',
    description: 'Executes a handler through the engine pipeline with guards, interceptors and class-validator pipes.',
    baseline: { validated: 'raw-validate', full: 'raw-validate' },
    setup: async () => {
        const { app, context } = createAppWithContext();
        await app.init();
        const executor = await BenchExecutor.create(app, context.container);
        if ((await executor.execute(UserHandler, 'full', user)) === undefined) throw new Error('The engine did not run the handler');
        return { executor };
    },
    tasks: {
        bare: (ctx) => ctx.executor.execute(UserHandler, 'bare'),
        guarded: (ctx) => ctx.executor.execute(UserHandler, 'guarded', user),
        validated: (ctx) => ctx.executor.execute(UserHandler, 'validated', user),
        full: (ctx) => ctx.executor.execute(UserHandler, 'full', user),
        'raw-validate': async () => {
            const instance = Object.assign(Object.create(CreateUser.prototype), user);
            const errors = await validate(instance);
            if (errors.length) throw new Error('Invalid');
            return instance;
        }
    },
    teardown: (ctx) => ctx.executor.destroy()
});
