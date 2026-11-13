/**
 * Synthetic plugins: `count` plugins where every plugin depends on up to `fanIn` of the previous ones, so the
 * registry has to order a real dependency graph.
 */
import { Plugin, type PluginType } from '@axisparkjs/core';
import { Injectable } from '@axisparkjs/di';

export function syntheticPlugins(count: number, fanIn = 3, prefix = `P${count}x`): PluginType[] {
    const plugins: PluginType[] = [];
    for (let index = 0; index < count; index++) {
        const dependencies = plugins.slice(Math.max(0, index - fanIn), index);
        const plugin = class extends Plugin {
            static readonly dependencies = dependencies;
            started = false;
            onRegister(): void {}
            onStart(): void {
                this.started = true;
            }
            onStop(): void {
                this.started = false;
            }
        };
        Object.defineProperty(plugin, 'name', { value: `${prefix}Plugin${index}` });
        Injectable()(plugin);
        plugins.push(plugin);
    }
    // Registered in reverse order: the registry has to sort them.
    return plugins.reverse();
}
