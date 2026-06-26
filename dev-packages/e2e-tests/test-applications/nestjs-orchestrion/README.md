# nestjs-orchestrion

E2E test app for the **orchestrion** (diagnostics-channel
injection) NestJS instrumentation. It is a normal
`@sentry/nestjs` app whose only difference from `nestjs-basic` is
that `src/instrument.ts` calls
`Sentry.experimentalUseDiagnosticsChannelInjection()` before
`Sentry.init()`. That swaps the OTel `Nest` integration for the
orchestrion subscriber (`@sentry/server-utils/orchestrion`) and
injects the diagnostics channels into `@nestjs/*` at load time.

The tests assert the **same** span tree the OTel path produces
(`nestjs-basic`), so this app is the opt-in side of an A/B
against that baseline:

- `transactions.test.ts`: `app_creation`, `request_context`,
  `handler`, and the
  `middleware.nestjs[.guard|.pipe|.interceptor|.exception_filter]`
  spans.
- `schedule.test.ts`: `@Cron`/`@Interval`/`@Timeout` error
  mechanisms.
- `events.test.ts`: the `@OnEvent` `event.nestjs` transaction.

> [!WARNING]
>
> ## ⚠️ Not yet runnable in CI
>
> This app installs `@apm-js-collab/code-transformer` from npm (a
> transitive dep of `@sentry/node`/`@sentry/server-utils`).
> Several spans depend on the `mutableResult` transform option,
> which is **not in the published version yet**:
>
> - `request_context` (wraps the handler returned by
>   `RouterExecutionContext.create`)
> - `@Cron`/`@Interval`/`@Timeout`, `@OnEvent` (wrap the
>   decorator the factory returns)
>
> `app_creation`, `request_handler`, and the
> `@Injectable`/`@Catch` spans only need `astQuery` + argument
> mutation (already published), so they should pass first.
>
> **Enable in CI once** the `@apm-js-collab/code-transformer`
> changes (`mutableResult` + documented `astQuery`) are published
> and pulled in. Until then keep this app out of the e2e run
> list.
