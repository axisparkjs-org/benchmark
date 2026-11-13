import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { KafkaConnectionManager, KafkaPlugin, KafkaPluginOptionsFactory } from '@axisparkjs/kafka';
import { createApp } from '../../fixtures/app';
import { Deliveries, infra } from '../../fixtures/infra';
import { defineSuite } from '../../runner/define-suite';

const TOPIC = `axispark-bench-${process.pid}`;
const RAW_TOPIC = `axispark-bench-raw-${process.pid}`;

interface Ctx {
    app: { destroy(): Promise<void> };
    producer: Producer;
    deliveries: Deliveries;
    raw: { producer: Producer; consumer: Consumer };
    rawDeliveries: Deliveries;
}

async function consume(consumer: Consumer, topic: string, deliveries: Deliveries): Promise<void> {
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({ eachMessage: async ({ message }) => deliveries.receive(message.key?.toString() ?? '') });
}

/** Sends one message until the consumer receives it: the group has joined and the partitions are assigned. */
async function warm(producer: Producer, topic: string, deliveries: Deliveries): Promise<void> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const { id, delivered } = deliveries.next();
        await producer.send({ topic, messages: [{ key: id, value: 'warm' }] });
        const received = await Promise.race([delivered.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))]);
        if (received) return;
    }
    throw new Error(`The consumer of ${topic} did not receive the messages`);
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/kafka',
    id: 'kafka.messages',
    version: 1,
    tier: 'infra',
    description: 'Produces a message, and produces and waits until its consumer receives it, through the plugin and with kafkajs alone.',
    baseline: { produce: 'raw-produce', 'produce-consume': 'raw-produce-consume' },
    setup: async () => {
        const kafka = new Kafka({ clientId: 'axispark-bench-admin', brokers: infra.kafka, logLevel: logLevel.NOTHING });
        const admin = kafka.admin();
        await admin.connect();
        await admin.createTopics({ topics: [{ topic: TOPIC }, { topic: RAW_TOPIC }], waitForLeaders: true });
        await admin.disconnect();

        const app = createApp({
            plugins: [
                [
                    KafkaPlugin,
                    KafkaPluginOptionsFactory.create({
                        connections: [{ name: 'BENCH', config: { clientId: 'axispark-bench', brokers: infra.kafka, logLevel: logLevel.NOTHING }, consumerConfig: { groupId: `axispark-bench-${process.pid}`, maxWaitTimeInMs: 100 } }]
                    })
                ]
            ]
        });
        await app.init();
        await app.run();
        const manager = await app.get(KafkaConnectionManager);
        const producer = manager.getProducer('BENCH') ?? (await manager.createProducer('BENCH'));
        const consumer = manager.getConsumer('BENCH') ?? (await manager.createConsumer('BENCH'));
        if (!producer || !consumer) throw new Error('The plugin did not create the producer and the consumer');
        const deliveries = new Deliveries();
        await consume(consumer, TOPIC, deliveries);

        const raw = new Kafka({ clientId: 'axispark-bench-raw', brokers: infra.kafka, logLevel: logLevel.NOTHING });
        const rawProducer = raw.producer();
        const rawConsumer = raw.consumer({ groupId: `axispark-bench-raw-${process.pid}`, maxWaitTimeInMs: 100 });
        await rawProducer.connect();
        await rawConsumer.connect();
        const rawDeliveries = new Deliveries();
        await consume(rawConsumer, RAW_TOPIC, rawDeliveries);

        await warm(producer, TOPIC, deliveries);
        await warm(rawProducer, RAW_TOPIC, rawDeliveries);
        return { app, producer, deliveries, raw: { producer: rawProducer, consumer: rawConsumer }, rawDeliveries };
    },
    tasks: {
        produce: (ctx) => ctx.producer.send({ topic: TOPIC, messages: [{ value: 'order' }] }),
        'produce-consume': async (ctx) => {
            const { id, delivered } = ctx.deliveries.next();
            await ctx.producer.send({ topic: TOPIC, messages: [{ key: id, value: 'order' }] });
            await delivered;
        },
        'raw-produce': (ctx) => ctx.raw.producer.send({ topic: RAW_TOPIC, messages: [{ value: 'order' }] }),
        'raw-produce-consume': async (ctx) => {
            const { id, delivered } = ctx.rawDeliveries.next();
            await ctx.raw.producer.send({ topic: RAW_TOPIC, messages: [{ key: id, value: 'order' }] });
            await delivered;
        }
    },
    teardown: async (ctx) => {
        await ctx.raw.consumer.disconnect();
        await ctx.raw.producer.disconnect();
        await ctx.app.destroy();
        const kafka = new Kafka({ clientId: 'axispark-bench-admin', brokers: infra.kafka, logLevel: logLevel.NOTHING });
        const admin = kafka.admin();
        await admin.connect();
        await admin.deleteTopics({ topics: [TOPIC, RAW_TOPIC] }).catch(() => undefined);
        await admin.disconnect();
    }
});
