# nestjs-orchestrion

E2E test app for the **orchestrion** (diagnostics-channel
injection) NestJS instrumentation. It is a normal
`@sentry/nestjs` app: channel-based instrumentation is the v11
default, so `Sentry.init()` uses the orchestrion `Nest` subscriber
(`@sentry/server-utils/orchestrion`) and injects the diagnostics
channels into `@nestjs/*` at load time.

The tests assert the **same** span tree the OTel path produced
(`nestjs-basic`), so this app guards the channel-based
instrumentation against that baseline:

- `transactions.test.ts`: `app_creation`, `request_context`,
  `handler`, and the
  `middleware.nestjs[.guard|.pipe|.interceptor|.exception_filter]`
  spans.
- `schedule.test.ts`: `@Cron`/`@Interval`/`@Timeout` error
  mechanisms.
- `events.test.ts`: the `@OnEvent` `event.nestjs` transaction.

The spans that reassign the value a decorator factory / route
handler returns (`request_context`,
`@Cron`/`@Interval`/`@Timeout`, `@OnEvent`) rely on the
transformer returning the (mutated) `ctx.result`. That is the
default for `Sync`/`Async` transforms as of
`@apm-js-collab/code-transformer` `0.16.0` (no `mutableResult`
opt-in), which `@sentry/node`/`@sentry/server-utils` depend on,
so this app runs against the published transformer.
