/**
 * Suites of `@axisparkjs/data`: the same entity and operations on each database, through a repository of the plugin
 * and through TypeORM alone.
 */
import type { ObjectId } from 'mongodb';
import { Column, DataSource, Entity, Index, ObjectIdColumn, PrimaryGeneratedColumn, type DataSourceOptions } from 'typeorm';
import { ClassRegistry } from '@axisparkjs/di';
import { BaseRepository, DataPlugin, DataPluginOptionsFactory, Repository } from '@axisparkjs/data';
import { createApp } from './app';
import { defineSuite, type SuiteDefinition } from '../runner/define-suite';

@Entity('bench_accounts')
export class Account {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 64 })
    code: string;

    @Column({ type: 'varchar', length: 64 })
    name: string;

    @Column('integer')
    balance: number;
}

@Entity('bench_accounts')
export class MongoAccount {
    @ObjectIdColumn()
    _id: ObjectId;

    @Index({ unique: true })
    @Column()
    code: string;

    @Column()
    name: string;

    @Column()
    balance: number;
}

type AnyAccount = Account | MongoAccount;

@Repository({ entity: Account })
export class AccountRepository extends BaseRepository<Account> {
    declare findOneByCode: (code: string) => Promise<Account | null>;
}

@Repository({ entity: MongoAccount })
export class MongoAccountRepository extends BaseRepository<MongoAccount> {
    declare findOneByCode: (code: string) => Promise<MongoAccount | null>;
}

interface Ctx {
    app: { destroy(): Promise<void> };
    repository: { save(entity: AnyAccount): Promise<AnyAccount>; findOneByCode(code: string): Promise<AnyAccount | null> };
    raw: DataSource;
    entity: new () => AnyAccount;
    sequence: number;
    known: string;
}

function account(entity: new () => AnyAccount, code: string): AnyAccount {
    return Object.assign(new entity(), { code, name: 'Account', balance: 100 });
}

export function dataSuite(database: 'postgres' | 'mysql' | 'mongodb', options: DataSourceOptions): SuiteDefinition<Ctx> {
    const mongo = database === 'mongodb';
    const entity = (mongo ? MongoAccount : Account) as new () => AnyAccount;
    const repositoryType = mongo ? MongoAccountRepository : AccountRepository;
    const run = `${process.pid}-${Date.now()}`;

    return defineSuite<Ctx>({
        package: '@axisparkjs/data',
        id: `data.${database}`,
        version: 1,
        tier: 'infra',
        description: `Insert and find by a unique key in ${database}, through a repository and through TypeORM alone.`,
        baseline: { insert: 'raw-insert', 'find-one-by-code': 'raw-find-one-by-code' },
        setup: async () => {
            // Only the repository of this database: the other one has an entity that this data source does not have.
            ClassRegistry.remove((mongo ? AccountRepository : MongoAccountRepository) as never);
            const app = createApp({
                plugins: [[DataPlugin, DataPluginOptionsFactory.create({ dataSources: [{ name: 'PRIMARY', options: { ...options, entities: [entity], synchronize: true, dropSchema: true } }] })]]
            });
            await app.init();
            await app.run();
            const raw = new DataSource({ ...options, name: 'raw', entities: [entity] } as unknown as DataSourceOptions);
            await raw.initialize();

            const repository = (await app.get(repositoryType as never)) as Ctx['repository'];
            const known = `known-${run}`;
            await repository.save(account(entity, known));
            if (!(await repository.findOneByCode(known))) throw new Error('The repository did not find the saved entity');
            return { app, repository, raw, entity, sequence: 0, known };
        },
        tasks: {
            insert: (ctx) => ctx.repository.save(account(ctx.entity, `a-${run}-${ctx.sequence++}`)),
            'find-one-by-code': (ctx) => ctx.repository.findOneByCode(ctx.known),
            'raw-insert': (ctx) => ctx.raw.getRepository(ctx.entity).save(account(ctx.entity, `r-${run}-${ctx.sequence++}`)),
            'raw-find-one-by-code': (ctx) => ctx.raw.getRepository(ctx.entity).findOneBy({ code: ctx.known })
        },
        teardown: async (ctx) => {
            await ctx.raw.destroy();
            await ctx.app.destroy();
        }
    });
}
