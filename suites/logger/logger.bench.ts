import { Console } from 'node:console';
import { JsonFormatter, Logger, LogLevel, SimpleFormatter, StreamTransport } from '@axisparkjs/logger';
import { nullStream } from '../../fixtures/null-stream';
import { defineSuite } from '../../runner/define-suite';

function transport(formatter = new SimpleFormatter(), minLevel = LogLevel.Info) {
    return new StreamTransport({ stream: nullStream(), minLevel, formatter });
}

export default defineSuite({
    package: '@axisparkjs/logger',
    id: 'logger.write',
    version: 1,
    tier: 'micro',
    description: 'Log calls written to a stream that discards them.',
    baseline: 'raw-console',
    setup: () => ({
        simple: new Logger([transport()], ['Bench']),
        json: new Logger([transport(new JsonFormatter())], ['Bench']),
        three: new Logger([transport(), transport(new JsonFormatter()), transport()], ['Bench']),
        child: new Logger([transport()], ['Bench']).child('Child', { requestId: 'r-1' }),
        console: new Console({ stdout: nullStream(), stderr: nullStream() })
    }),
    tasks: {
        filtered: (ctx) => ctx.simple.debug('Filtered by the level'),
        simple: (ctx) => ctx.simple.info('Request completed'),
        'simple-metadata': (ctx) => ctx.simple.info('Request completed', { method: 'GET', path: '/users', status: 200, durationMs: 12 }),
        json: (ctx) => ctx.json.info('Request completed', { method: 'GET', path: '/users', status: 200 }),
        child: (ctx) => ctx.child.info('Route matched', { route: '/users/:id' }),
        'transports-3': (ctx) => ctx.three.info('Request completed'),
        'raw-console': (ctx) => ctx.console.log('[Bench] INFO Request completed')
    }
});
