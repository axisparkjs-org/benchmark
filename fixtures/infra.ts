/**
 * Connection settings of the services of `docker-compose.yml`. Each one can be replaced with an environment variable
 * to run the `infra` tier against other servers.
 */
export const infra = {
    postgres: {
        host: process.env.BENCH_POSTGRES_HOST ?? 'localhost',
        port: Number(process.env.BENCH_POSTGRES_PORT ?? 5432),
        username: 'axispark',
        password: 'axispark',
        database: 'axispark_bench'
    },
    mysql: {
        host: process.env.BENCH_MYSQL_HOST ?? 'localhost',
        port: Number(process.env.BENCH_MYSQL_PORT ?? 3306),
        username: 'axispark',
        password: 'axispark',
        database: 'axispark_bench'
    },
    mongodb: {
        host: process.env.BENCH_MONGODB_HOST ?? 'localhost',
        port: Number(process.env.BENCH_MONGODB_PORT ?? 27017),
        username: 'axispark',
        password: 'axispark',
        database: 'axispark_bench',
        authSource: 'admin'
    },
    redis: process.env.BENCH_REDIS_URL ?? 'redis://localhost:6379/0',
    rabbitmq: process.env.BENCH_RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    kafka: (process.env.BENCH_KAFKA_BROKERS ?? 'localhost:9092').split(',')
};

/** Waits for a condition, for the clients that connect in the background. */
export async function waitFor(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}: is the service of docker-compose.yml running?`);
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

/**
 * Pending deliveries of a round trip: the task sends a message with an id and waits until its consumer receives it.
 */
export class Deliveries {
    private readonly pending = new Map<string, () => void>();
    private sequence = 0;

    next(): { id: string; delivered: Promise<void> } {
        const id = `${process.pid}-${this.sequence++}`;
        const delivered = new Promise<void>((resolve) => this.pending.set(id, resolve));
        return { id, delivered };
    }

    receive(id: string): void {
        const resolve = this.pending.get(id);
        if (!resolve) return;
        this.pending.delete(id);
        resolve();
    }
}
