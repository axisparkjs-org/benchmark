# AxiSpark.js benchmarks

Reproducible performance report of every AxiSpark.js release. Each release published in `pro` is measured with the
packages installed from npm, like a user installs them, and its result is archived in `results/` to follow the
evolution of the framework. The website renders the reports in [/benchmarks](https://axisparkjs.com/benchmarks).

This repository is separate from the code (`axispark`) and the documentation (`website`): it only talks to them through
GitHub events and npm. If a run fails, the release goes on.

```text
axispark (CD, pro) ──axispark-release──▶ benchmarks (bench.yml) ──benchmarks-updated──▶ website (CD)
        │                                    ▲      │
        └──────── npm publish ───────────────┘      └── results/<version>/node-<major>.json
```

## Run the benchmarks

```bash
npm ci
npm run bench -- --quick              # every suite, short measurement (local development, never saved)
npm run bench -- --suite di --quick   # one suite or a prefix of its id
npm run bench:micro                   # one tier with the measurement of the releases
npm run infra:up && npm run bench:infra && npm run infra:down
npm run coverage                      # every published package has a suite
```

`run.js` options: `--tier`, `--suite`, `--package`, `--kind release|backfill|snapshot`, `--sha`, `--out`,
`--quick`, `--strict` and `--list`. A local run is a `snapshot` and is written in `out/`.

To measure another version, build first and then install it: `npm run build && node scripts/set-version.mjs <version>
&& npm install`. The suites of packages that the version does not have, or that cannot be loaded with its API, are
left out; a suite that fails while it runs is written in `errors` and the others go on.

## Structure

| Path | Content |
| --- | --- |
| `bench.config.ts` | Options of tinybench shared by every suite. Fixed between releases. |
| `suites/<package>/*.bench.ts` | At least one suite per published package. |
| `suites/scenarios/` | Transversal scenarios: boot and complete applications. |
| `fixtures/` | Synthetic plugins, controllers and files, in-memory adapters, copies of the samples. |
| `runner/run.ts` | Discovers the suites, runs each one in new processes and writes the result. |
| `runner/worker.ts` | Runs one suite in its own process. |
| `runner/env.ts` | Metadata of the environment and fingerprint of the machine. |
| `runner/coverage.ts` | Fails if a published package has no suite. |
| `results/` | History database: one immutable file per release and Node.js major, and `index.json`. |
| `docker-compose.yml` | Postgres, MySQL, MongoDB, RabbitMQ, Redis and Kafka for the `infra` tier. |

## Write a suite

A suite exports a declarative definition; the runner creates the tinybench `Bench`, so the configuration is the same
everywhere:

```ts
import { defineSuite } from '../../runner/define-suite';

export default defineSuite({
    package: '@axisparkjs/di',
    id: 'di.resolve',
    version: 1, // increase it when the measurement changes: it starts a new series
    tier: 'micro', // micro | app | infra
    baseline: 'raw-new', // reference task without the framework (or a map task → reference)
    setup: async () => ({ container: createContainer() }),
    tasks: {
        singleton: (ctx) => ctx.container.resolve(SingletonService),
        'raw-new': () => new DeepServiceManual()
    },
    memory: {
        // heapUsed retained by the state that the probe creates, after a gc()
    },
    teardown: async (ctx) => {}
});
```

Conventions:

- **Stable id**: every task is identified by `<package>/<suite>@v<version>/<task>`, the key of its time series. Rename a
  task or change what it measures, and its series starts again: do it by increasing `version`.
- **Tiers**: `micro` (pure CPU, no I/O), `app` (real application with a server on loopback, or a new process) and
  `infra` (needs the services of `docker-compose.yml`). They run separately with `--tier`.
- **Isolation**: every suite, and every repetition, runs in a new process. The classes registered by the decorators of
  one suite never reach another one. Inside a suite, the tasks that compare sizes keep only their own classes
  registered with `ClassGroups.only()` (`fixtures/app.ts`).
- **Public API only**: the suites use what the packages export. The `micro` suites of HTTP and WebSocket run the
  pipeline through in-memory adapters (`fixtures/http.ts`, `fixtures/websocket.ts`) that implement the same adapter
  contracts as Express, Fastify and Socket.IO.
- **Check before measuring**: `setup` sends one real request or message and fails if the answer is not the expected one.
  A suite that measures an error path must not pass by accident.
- **Reference without the framework**: when there is one, the suite publishes `baselineRatio` = p50 of the task / p50 of
  the reference. The ratio is the real overhead of AxiSpark.js and varies much less between machines than the
  absolute time.

## Results

`results/<version>/node-<major>.json` (schema in `runner/schema.ts`):

- `env.fingerprint` identifies the machine (`gh-ubuntu-24.04-4cpu`). Only results with the same fingerprint are comparable.
  `BENCH_FINGERPRINT` replaces it, for example for a dedicated machine.
- `run.kind` is `release`, `backfill` (an old release measured later) or `snapshot` (unpublished branches). The website
  only shows `release` and `backfill`.
- A file is never rewritten. When a release is measured again in another machine (backfill after a change of machine),
  the result is `node-<major>@<fingerprint>.json`.
- `results/index.json` lists the releases, environments and files: it is the only file the website reads.

Each task keeps the median of 3 runs of `latencyNs` (mean, p50, p75, p99, mad, rme), `throughputOps`, `samples`,
`baselineRatio` and, for the boot scenarios, `heapBytes` after `init()`.

## Workflow

`bench.yml` runs on the `axispark-release` event of the CD of axispark (`client_payload.version` and `ref`), or by hand
with `workflow_dispatch` for backfills, repetitions and snapshots. It measures with Node.js 24 in a GitHub hosted runner,
commits the result in `results/` and tells the website. It does not compare the releases nor open issues. It needs this
secret:

| Secret | Use |
| --- | --- |
| `WEBSITE_REPO_TOKEN` | Sends `benchmarks-updated` to the website. |

When the machine changes (new fingerprint), measure the last releases again with `kind: backfill`, so the series stays
comparable instead of having an artificial jump.
