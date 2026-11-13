import amqplib, { type Channel, type ChannelModel } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';
import { RabbitMQConnectionManager, RabbitMQPlugin, RabbitMQPluginOptionsFactory } from '@axisparkjs/rabbitmq';
import { createApp } from '../../fixtures/app';
import { Deliveries, infra } from '../../fixtures/infra';
import { defineSuite } from '../../runner/define-suite';

const QUEUE = `axispark-bench-${process.pid}`;
const RAW_QUEUE = `axispark-bench-raw-${process.pid}`;

interface Ctx {
    app: { destroy(): Promise<void> };
    channel: ChannelWrapper;
    deliveries: Deliveries;
    raw: { connection: ChannelModel; channel: Channel };
    rawDeliveries: Deliveries;
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/rabbitmq',
    id: 'rabbitmq.messages',
    version: 1,
    tier: 'infra',
    // Both connections disable Nagle's algorithm (`noDelay`): otherwise every round trip waits ~40 ms for the delayed ACK
    // of the socket, which hides the cost of the client.
    description: 'Publishes a message and waits until its consumer receives it, through the plugin and with amqplib alone.',
    baseline: { 'publish-consume': 'raw-publish-consume' },
    setup: async () => {
        const app = createApp({ plugins: [[RabbitMQPlugin, RabbitMQPluginOptionsFactory.create({ connections: [{ name: 'BENCH', url: infra.rabbitmq, options: { connectionOptions: { noDelay: true } } }] })]] });
        await app.init();
        await app.run();
        const connection = (await app.get(RabbitMQConnectionManager)).getConnection('BENCH');
        if (!connection) throw new Error('The plugin did not create the connection');

        const deliveries = new Deliveries();
        const channel = connection.createChannel({
            json: true,
            setup: async (ch: ConfirmChannel) => {
                await ch.assertQueue(QUEUE, { autoDelete: true });
                await ch.consume(QUEUE, (message) => {
                    if (!message) return;
                    ch.ack(message);
                    deliveries.receive(JSON.parse(message.content.toString()).id);
                });
            }
        });
        await channel.waitForConnect();

        const rawConnection = await amqplib.connect(infra.rabbitmq, { noDelay: true });
        const rawChannel = await rawConnection.createChannel();
        const rawDeliveries = new Deliveries();
        await rawChannel.assertQueue(RAW_QUEUE, { autoDelete: true });
        await rawChannel.consume(RAW_QUEUE, (message) => {
            if (!message) return;
            rawChannel.ack(message);
            rawDeliveries.receive(JSON.parse(message.content.toString()).id);
        });

        return { app, channel, deliveries, raw: { connection: rawConnection, channel: rawChannel }, rawDeliveries };
    },
    tasks: {
        'publish-consume': async (ctx) => {
            const { id, delivered } = ctx.deliveries.next();
            await ctx.channel.sendToQueue(QUEUE, { id, order: 'o-1' });
            await delivered;
        },
        'raw-publish-consume': async (ctx) => {
            const { id, delivered } = ctx.rawDeliveries.next();
            ctx.raw.channel.sendToQueue(RAW_QUEUE, Buffer.from(JSON.stringify({ id, order: 'o-1' })));
            await delivered;
        }
    },
    teardown: async (ctx) => {
        await ctx.channel.close();
        await ctx.raw.channel.close();
        await ctx.raw.connection.close();
        await ctx.app.destroy();
    }
});
