/**
 * Synthetic controllers: `count` routes in groups of 10 per controller, `GET /c<i>/r<j>/:id`.
 */
import { Controller, Get, Path } from '@axisparkjs/http';

export interface SyntheticRoutes {
    controllers: Function[];
    /** Path of a route in the middle of the table, relative to the base path. */
    middle: string;
}

export function syntheticControllers(count: number, prefix = `n${count}`): SyntheticRoutes {
    const controllers: Function[] = [];
    const perController = 10;
    for (let c = 0; c < Math.ceil(count / perController); c++) {
        const controller = class {};
        Object.defineProperty(controller, 'name', { value: `${prefix}Controller${c}` });
        for (let r = 0; r < perController && c * perController + r < count; r++) {
            const method = `r${r}`;
            Object.defineProperty(controller.prototype, method, {
                value: function (id: string) {
                    return { controller: c, route: r, id };
                },
                writable: true,
                configurable: true
            });
            const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, method)!;
            Path('id')(controller.prototype, method, 0);
            Get(`r${r}/:id`)(controller.prototype, method, descriptor);
        }
        Controller(`${prefix}c${c}`)(controller);
        controllers.push(controller);
    }
    const middle = Math.floor(count / 2);
    return { controllers, middle: `/${prefix}c${Math.floor(middle / perController)}/r${middle % perController}/42` };
}
