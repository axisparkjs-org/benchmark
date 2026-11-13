import { CronTime } from 'cron';
import { Cron, CronExpression, Interval, SchedulePlugin, Scheduler, SchedulerRegistry, type JobDefinition } from '@axisparkjs/schedule';
import { ClassGroups, createApp } from '../../fixtures/app';
import { defineSuite } from '../../runner/define-suite';

const HOUR = 3_600_000;

/** A scheduler with 100 interval jobs that never fire during the measurement. */
function hundredJobs(): Function {
    const scheduler = class {
        runs = 0;
    };
    Object.defineProperty(scheduler, 'name', { value: 'HundredJobs' });
    for (let index = 0; index < 100; index++) {
        const name = `job${index}`;
        Object.defineProperty(scheduler.prototype, name, {
            value: async function (this: { runs: number }) {
                this.runs++;
            },
            writable: true,
            configurable: true
        });
        Interval({ value: HOUR, name: `interval-${index}` })(scheduler.prototype, name, Object.getOwnPropertyDescriptor(scheduler.prototype, name)!);
    }
    Scheduler()(scheduler);
    return scheduler;
}

@Scheduler()
class ReportJobs {
    runs = 0;

    @Cron({ value: CronExpression.EverySecond, name: 'every-second', disabled: true })
    async everySecond() {
        this.runs++;
    }
}

const groups = new ClassGroups();
groups.add('100', [hundredJobs()]);
groups.add('cron', [ReportJobs]);

async function registerAndStart(): Promise<void> {
    const app = createApp({ plugins: [SchedulePlugin] });
    await app.init();
    await app.run();
    await app.destroy();
}

interface Ctx {
    app: { destroy(): Promise<void> };
    job: JobDefinition;
    cron: CronTime;
    runs: number;
}

export default defineSuite<Ctx>({
    package: '@axisparkjs/schedule',
    id: 'schedule.jobs',
    version: 1,
    tier: 'micro',
    description: 'Discovers and starts 100 jobs, and runs one tick of a cron job.',
    baseline: { tick: 'raw-cron-tick' },
    setup: async () => {
        groups.only('cron');
        const app = createApp({ plugins: [SchedulePlugin] });
        await app.init();
        await app.run();
        const job = (await app.get(SchedulerRegistry)).getJob('every-second');
        if (!job) throw new Error('The cron job was not registered');
        return { app, job, cron: new CronTime(CronExpression.EverySecond), runs: 0 };
    },
    tasks: {
        'register-start-100': { fn: registerAndStart, beforeAll: () => groups.only('100') },
        // One tick: run the job and compute its next execution, as the runner does before scheduling the timer.
        tick: async (ctx) => {
            await ctx.job.execute();
            return ctx.job.getNextExecutionTime();
        },
        'raw-cron-tick': async (ctx) => {
            ctx.runs++;
            return ctx.cron.getNextDateFrom(new Date());
        }
    },
    teardown: (ctx) => ctx.app.destroy()
});
