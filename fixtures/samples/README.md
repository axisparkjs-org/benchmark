# Samples

Copies of the samples of the axispark repository (`samples/`), used by the `app.*` scenarios. They keep the code of
the sample; only the application factory changes, so the logs are discarded and `run()` does not wait for a
termination signal (see `fixtures/app.ts`).

| Fixture | Sample |
| --- | --- |
| `hello-world/` | `samples/hello-world` |
| `todo-crud/` | `samples/todo-crud` |

When a sample changes in a relevant way, update the copy and increase the `version` of its scenario.
