import { Injectable } from '@axisparkjs/di';
import type { ExecutionContext } from '@axisparkjs/engine';
import { Controller, Get, type HttpContext } from '@axisparkjs/http';
import {
    Authenticator,
    AuthorizationPolicy,
    Secured,
    SecurityPlugin,
    SecurityPluginOptionsFactory,
    type AuthorizationDecision,
    type SecurityContext
} from '@axisparkjs/security';
import { createApp } from '../../fixtures/app';
import { expectStatus, memoryAdapter, memoryHttpPlugin, type MemoryHttpAdapter } from '../../fixtures/http';
import { defineSuite } from '../../runner/define-suite';

interface Principal {
    id: string;
    roles: string[];
    active: boolean;
}

const TOKENS = new Map<string, Principal>([['secret-token', { id: 'u-1', roles: ['admin'], active: true }]]);

@Injectable()
class BearerAuthenticator extends Authenticator {
    async authenticate(context: ExecutionContext): Promise<Principal | undefined> {
        const authorization = (context as HttpContext).request.getHeader('authorization');
        if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return undefined;
        return TOKENS.get(authorization.slice('Bearer '.length));
    }
}

@Injectable()
class ActivePolicy extends AuthorizationPolicy {
    async authorize(context: SecurityContext<Principal>): Promise<AuthorizationDecision> {
        return context.data?.active ? { policy: ActivePolicy, authorized: true } : { policy: ActivePolicy, authorized: false, reason: 'Inactive' };
    }
}

@Injectable()
class AdminPolicy extends AuthorizationPolicy {
    async authorize(context: SecurityContext<Principal>): Promise<AuthorizationDecision> {
        return context.data?.roles.includes('admin')
            ? { policy: AdminPolicy, authorized: true }
            : { policy: AdminPolicy, authorized: false, reason: 'An administrator role is required' };
    }
}

@Controller('reports')
class ReportsController {
    @Get('public')
    publicReport() {
        return { report: 'public' };
    }

    @Get('mine')
    @Secured({ policies: [] })
    mine() {
        return { report: 'mine' };
    }

    @Get('admin')
    @Secured({ policies: [ActivePolicy, AdminPolicy] })
    admin() {
        return { report: 'admin' };
    }
}
void ReportsController;

const AUTH = { authorization: 'Bearer secret-token' };

export default defineSuite<{ app: { destroy(): Promise<void> }; http: MemoryHttpAdapter }>({
    package: '@axisparkjs/security',
    id: 'security.pipeline',
    version: 1,
    tier: 'micro',
    description: 'Authentication and authorization policies of an HTTP request, without network.',
    setup: async () => {
        const app = createApp({
            plugins: [memoryHttpPlugin(), [SecurityPlugin, SecurityPluginOptionsFactory.create({ authenticator: { strategy: 'selected', selected: [BearerAuthenticator] } })]]
        });
        await app.init();
        await app.run();
        const http = await memoryAdapter(app);
        await expectStatus(http.dispatch('GET', '/api/reports/public'), 200);
        await expectStatus(http.dispatch('GET', '/api/reports/mine', AUTH), 200);
        await expectStatus(http.dispatch('GET', '/api/reports/admin', AUTH), 200);
        const rejected = await http.dispatch('GET', '/api/reports/admin');
        if (rejected.statusCode === 200) throw new Error('A secured route answered without credentials');
        return { app, http };
    },
    tasks: {
        public: (ctx) => ctx.http.dispatch('GET', '/api/reports/public'),
        authenticated: (ctx) => ctx.http.dispatch('GET', '/api/reports/mine', AUTH),
        'policies-2': (ctx) => ctx.http.dispatch('GET', '/api/reports/admin', AUTH),
        rejected: (ctx) => ctx.http.dispatch('GET', '/api/reports/admin')
    },
    teardown: (ctx) => ctx.app.destroy()
});
