import 'reflect-metadata';
import { Metadata, MetadataKey } from '@axisparkjs/common';
import { defineSuite } from '../../runner/define-suite';

const KEY = new MetadataKey('bench:metadata');
const RAW_KEY = 'bench:metadata';

class Target {
    handle(): void {}
}
const instance = new Target();
const value = { target: Target, name: 'handle' };

Metadata.define(KEY, value, Target);
Metadata.define(KEY, value, Target, 'handle');
Reflect.defineMetadata(RAW_KEY, value, Target);
Reflect.defineMetadata(RAW_KEY, value, Target, 'handle');

export default defineSuite({
    package: '@axisparkjs/common',
    id: 'common.metadata',
    version: 1,
    tier: 'micro',
    description: 'Reads and writes the decorator metadata through the Metadata helper.',
    baseline: {
        'get-class': 'raw-get-class',
        'get-instance': 'raw-get-class',
        'get-method': 'raw-get-method',
        has: 'raw-has',
        define: 'raw-define'
    },
    tasks: {
        'get-class': () => Metadata.get(KEY, Target),
        'get-instance': () => Metadata.get(KEY, instance),
        'get-method': () => Metadata.get(KEY, Target, 'handle'),
        has: () => Metadata.has(KEY, Target),
        define: () => Metadata.define(KEY, value, Target, 'define'),
        'raw-get-class': () => Reflect.getMetadata(RAW_KEY, Target),
        'raw-get-method': () => Reflect.getMetadata(RAW_KEY, Target, 'handle'),
        'raw-has': () => Reflect.hasMetadata(RAW_KEY, Target),
        'raw-define': () => Reflect.defineMetadata(RAW_KEY, value, Target, 'define')
    }
});
