---
name: convert-otel-integration
description: Add a new portable integration which can be used by all JavaScript SDKs, by converting an `@opentelemetry/instrumentation-*` implementation that was previously limited to only the Node SDK.
argument-hint: <module-name>
---

# Converting an OpenTelemetry Instrumentation to Portable Sentry SDK Integration

This skill converts the node-specific instrumentation found in an `@opentelemetry/instrumentation-<module-name>` package, and creates a standalone integration that either leverages existing TracingChannel support, or takes the module exports as an option argument for patching, instead of relying on intercepting the import.

## Instructions

### Step 1: Analysis

- Read the code in `@opentelemetry/instrumentation-<module-name>` dependency, to see what is being patched.
- Read the code that uses it in `packages/node/src/integrations`. Especially, take note of what functionality is injected in callbacks or options, which provide Sentry-specific behaviors.

### Step 2: Standalone Implementation

- Use the integrations listed in `.agents/skills/convert-otel-integration/EXAMPLES.md` as examples for guidance.
- **Create New Integration**
  - Create the new portable integration in `packages/core/src/integrations/<module-name>`.
  - This code must encapsulate the relevant patching, but importantly, _not_ any module-loading interception.
  - Expect to receive the module's exported object as an argument.
  - Capture data using Sentry-specific methods and functions rather than OpenTelemetry APIs.
  - Export the new standalone integration methods from the `@sentry/core` package for use in other SDKs.
  - **DO NOT** port any "unpatch" or "uninstrument" methods. Once applied, the Sentry patch is permanent, so we can save on bundle size.
  - Make sure to include a header on each code file, attributing the source appropriately in accordance with its license, and declaring the new implemetation as a derivative work.
- **Unit Tests**
  - Create unit tests at `packages/core/test/lib/integrations/<module-name>`, with a corresponding `.test.ts` file for each `.ts` file created in `packages/core/src/integrations/<module-name>`.
  - Each created test file should cover its corresponding source file to 100% of statements, lines, and branches, with a minimum of tests.
  - Mock internal and external interfaces to target all parts of the new code.
- **Check**
  - Ensure that all unit tests pass: `cd packages/core && vitest run test/lib/integrations/<module-name>`
  - Ensure that the build suceeds: `yarn build`

### Step 3: Node Integration

- Use the integrations listed in `.agents/skills/convert-otel-integration/EXAMPLES.md` as examples for guidance.
- Locate the file in `packages/node` that uses the `@opentelemetry/instrumentation-<module-name>` dependency.
- Replace this integration code with a new integration. The new code should create a class that extends `InstrumentationBase<{CONFIG_TYPE}>`, and call the patching method created in the previous step.
- Remove the dependency on `@opentelemetry/instrumentation-<module-name>` in `packages/node/package.json`.
- Verify that all unit tests in `packages/node` still pass: `cd packages/node ; yarn test`.
- Add integration points if needed to maintain compatibility with existing OpenTelemetry features of the node SDK, but keep any divergence to a minimum.
  - If the added functionality for OTEL compatibility is more than 10 lines of custom code, pause and ask for human guidance.

### Step 4: Integration Tests

- Run `yarn fix` to detect and address any lint issues.
- Run `yarn build` to build all the code.
- Run `yarn install` to update the lockfile, removing the now-unnecessary otel instrumentation dependency.
- Run `cd dev-packages/node-integration-tests; yarn test` to run node integration tests.
- Debug and fix any issues that this process uncovers.

### Step 5: Summarize and Record

- Write a summary of what was done to `.agents/skills/convert-otel-integration/logs/<module-name>.md`.
- Write a new entry to `.agents/skills/convert-otel-integration/EXAMPLES.md` for the new integration's replaced OTEL intestrumentation package, core integration location, unit test location, and node integration location.
