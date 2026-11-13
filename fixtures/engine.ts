/**
 * A transport for the engine suites: the executions use `ExecutionTransport.Other`, take their input from the
 * `bench:input` parameter and save the value returned by the handler in `output`. It is registered through the same
 * extension points that HTTP, WebSocket and MCP use.
 */
import type { ClassType } from '@axisparkjs/common';
import type { ScopedContainer } from '@axisparkjs/di';
import {
    ExecutionEngine,
    ExecutionTransport,
    Parameter,
    ParameterGenerator,
    ResultDefinition,
    ResultProcessor,
    ResultResolver,
    type ExecutionContext
} from '@axisparkjs/engine';
import type { AxiSparkCore } from '@axisparkjs/core';

export interface BenchContext extends ExecutionContext {
    input: unknown;
    output?: unknown;
}

const INPUT = 'bench:input';

class BenchResult extends ResultDefinition {
    async process(context: ExecutionContext): Promise<void> {
        (context as BenchContext).output = this.value;
    }
}

class BenchResultResolver extends ResultResolver {
    resolve(result: unknown): ResultDefinition {
        return new BenchResult(result, 0);
    }
}

ParameterGenerator.registerParameter(INPUT, { resolve: (context) => (context as BenchContext).input });
ResultProcessor.registerResult(ExecutionTransport.Other, new BenchResultResolver());

/** Parameter decorator with the input of the execution. */
export const Input = () => Parameter(INPUT);

export class BenchExecutor {
    private constructor(
        private readonly engine: ExecutionEngine,
        private readonly app: AxiSparkCore,
        private readonly container: { createScopedContainer(): ScopedContainer }
    ) {}

    static async create(app: AxiSparkCore, container: { createScopedContainer(): ScopedContainer }): Promise<BenchExecutor> {
        return new BenchExecutor(await app.get(ExecutionEngine), app, container);
    }

    async execute(target: ClassType, propertyKey: string, input?: unknown): Promise<unknown> {
        const context: BenchContext = {
            target,
            propertyKey,
            transport: ExecutionTransport.Other,
            scopedContainer: this.container.createScopedContainer(),
            input
        };
        await this.engine.execute(context);
        if (context.error) throw context.error;
        return context.output;
    }

    destroy(): Promise<void> {
        return this.app.destroy();
    }
}
