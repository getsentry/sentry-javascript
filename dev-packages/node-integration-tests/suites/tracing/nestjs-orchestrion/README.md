# nestjs-orchestrion integration test

In-process verification of the orchestrion (diagnostics-channel)
NestJS instrumentation. Unlike the e2e app
(`e2e-tests/test-applications/nestjs-orchestrion`, which installs
the **published** `@apm-js-collab/code-transformer`), this
harness resolves dependencies from the repo root `node_modules`,
where the code-transformer is **symlinked to the local
checkout**, so it can validate the `mutableResult`-dependent
spans (`request_context`, schedule, event) **before** the
upstream npm publish.

- `instrument-orchestrion.mjs`: `--import`ed before the scenario;
  opts in + inits.
- `scenario.ts`: a minimal NestJS app (`NestFactory.create` + one
  route).
- `test.ts`: `createRunner` asserts the `app_creation`,
  `request_context` and `handler` spans. **Currently
  `describe.skip`.**

> [!WARNING]
>
> ## ⚠️ Currently not runnable in CI - Prerequesitest to un-skip
>
> 1. `@apm-js-collab/code-transformer` with `mutableResult`
>    available. (The local checkout is symlinked into root
>    `node_modules`, so this is satisfied as soon as that work is
>    built. No npm publish needed for this test).
> 2. Add `rxjs` and `reflect-metadata` to this package's
>    `devDependencies`. NestJS cannot load without them.
>    (`@nestjs/common`/`core`/`platform-express` are already
>    present.)
> 3. Ensure `scenario.ts` compiles with `experimentalDecorators`
>    and `emitDecoratorMetadata` (NestJS dependency injection
>    needs them). `scenario.ts` runs via `ts-node/register`,
>    which uses this package's tsconfig; add a suite-local
>    tsconfig if the shared one lacks those options.
>
> Then remove `.skip` in `test.ts`.
