# Adding a New CDN Bundle

This guide explains how to create a new CDN bundle for the browser package that includes a specific combination of features.

## Feature Combinations

Feature combinations use dot notation:

- `logs.metrics` - Bundle with logs and metrics
- `replay.logs.metrics` - Bundle with replay, logs, and metrics
- `tracing.replay.logs` - Bundle with tracing, replay, and logs
- `tracing.replay.feedback.logs.metrics` - Full featured bundle

**Feature order in bundle names:** `tracing` → `replay` → `feedback` → `logs` → `metrics`

## Naming Conventions

Given a feature combination, derive these variants:

| Placeholder                     | Example (`replay.logs.metrics`) |
| ------------------------------- | ------------------------------- |
| `{FEATURE_COMBO}`               | `replay.logs.metrics`           |
| `{feature_combo}`               | `replay_logs_metrics`           |
| `{featureCombo}`                | `replayLogsMetrics`             |
| `{Human Readable Features}`     | `Replay, Logs, Metrics`         |
| `{Human Readable Feature List}` | `Replay, Logs, and Metrics`     |

## Files to Create

### 1. Entry Point: `packages/browser/src/index.bundle.{FEATURE_COMBO}.ts`

**Base structure:**

```typescript
// If bundle includes TRACING, add this at the top:
import { registerSpanErrorInstrumentation } from '@sentry/core';
registerSpanErrorInstrumentation();

// Always export base bundle
export * from './index.bundle.base';
```

**For LOGS (without tracing):**

```typescript
export { logger, consoleLoggingIntegration } from '@sentry/core';
```

**For TRACING:**

```typescript
export {
  getActiveSpan,
  getRootSpan,
  getSpanDescendants,
  setMeasurement,
  startInactiveSpan,
  startNewTrace,
  startSpan,
  startSpanManual,
  withActiveSpan,
} from '@sentry/core';

export {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from './tracing/browserTracingIntegration';
export { reportPageLoaded } from './tracing/reportPageLoaded';
export { setActiveSpanInBrowser } from './tracing/setActiveSpan';
```

**For REPLAY:**

```typescript
export { replayIntegration, getReplay } from '@sentry-internal/replay';
```

**For FEEDBACK:**

```typescript
import { feedbackAsyncIntegration } from './feedbackAsync';
export { getFeedback, sendFeedback } from '@sentry-internal/feedback';
export { feedbackAsyncIntegration as feedbackAsyncIntegration, feedbackAsyncIntegration as feedbackIntegration };
```

**For features NOT included, export shims:**

```typescript
import {
  browserTracingIntegrationShim, // if NO tracing
  feedbackIntegrationShim, // if NO feedback
  replayIntegrationShim, // if NO replay
  consoleLoggingIntegrationShim, // if NO logs
  loggerShim, // if NO logs
} from '@sentry-internal/integration-shims';

// Then export them with proper names:
export { browserTracingIntegrationShim as browserTracingIntegration };
export { feedbackIntegrationShim as feedbackAsyncIntegration, feedbackIntegrationShim as feedbackIntegration };
export { replayIntegrationShim as replayIntegration };
export { consoleLoggingIntegrationShim as consoleLoggingIntegration, loggerShim as logger };
```

### 2. Test File: `packages/browser/test/index.bundle.{FEATURE_COMBO}.test.ts`

```typescript
import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { describe, expect, it } from 'vitest';
// Import real integrations for features included in the bundle
import { browserTracingIntegration, feedbackAsyncIntegration, replayIntegration } from '../src';
import * as Bundle from '../src/index.bundle.{FEATURE_COMBO}';

describe('index.bundle.{FEATURE_COMBO}', () => {
  it('has correct exports', () => {
    // Test real exports match core implementations
    expect(Bundle.browserTracingIntegration).toBe(browserTracingIntegration); // if tracing included
    expect(Bundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration); // if feedback included
    expect(Bundle.replayIntegration).toBe(replayIntegration); // if replay included
    expect(Bundle.logger).toBe(coreLogger); // if logs included
    expect(Bundle.metrics).toBe(coreMetrics); // always (in base bundle)
  });
});
```

## Files to Modify

### 3. `packages/browser/rollup.bundle.config.mjs`

Add bundle config before `builds.push(...)`:

```javascript
const {featureCombo}BaseBundleConfig = makeBaseBundleConfig({
  bundleType: 'standalone',
  entrypoints: ['src/index.bundle.{FEATURE_COMBO}.ts'],
  licenseTitle: '@sentry/browser ({Human Readable Feature List})',
  outputFileBase: () => 'bundles/bundle.{FEATURE_COMBO}',
});
```

Add to `builds.push(...)`:

```javascript
...makeBundleConfigVariants({featureCombo}BaseBundleConfig),
```

### 4. `.size-limit.js`

Add two entries in the "Browser CDN bundles" section:

```javascript
// Gzipped (add after similar bundles)
{
  name: 'CDN Bundle (incl. {Human Readable Features})',
  path: createCDNPath('bundle.{FEATURE_COMBO}.min.js'),
  gzip: true,
  limit: '{SIZE} KB',  // Estimate based on features
},

// Uncompressed (add in the non-gzipped section)
{
  name: 'CDN Bundle (incl. {Human Readable Features}) - uncompressed',
  path: createCDNPath('bundle.{FEATURE_COMBO}.min.js'),
  gzip: false,
  brotli: false,
  limit: '{SIZE} KB',  // ~3x the gzipped size
},
```

#### Size Estimation Guide

Use these approximate sizes when setting limits in `.size-limit.js`:

| Feature     | Gzipped Size |
| ----------- | ------------ |
| Base bundle | ~28 KB       |
| + Tracing   | +15 KB       |
| + Replay    | +37 KB       |
| + Feedback  | +12 KB       |
| + Logs      | +1 KB        |

Uncompressed size is approximately 3x the gzipped size.

### 5. `dev-packages/browser-integration-tests/package.json`

Add test scripts in the `scripts` section:

```json
"test:bundle:{feature_combo}": "PW_BUNDLE=bundle_{feature_combo} yarn test",
"test:bundle:{feature_combo}:min": "PW_BUNDLE=bundle_{feature_combo}_min yarn test",
"test:bundle:{feature_combo}:debug_min": "PW_BUNDLE=bundle_{feature_combo}_debug_min yarn test",
```

### 6. `dev-packages/browser-integration-tests/utils/generatePlugin.ts`

Add entries to `BUNDLE_PATHS.browser`:

```javascript
bundle_{feature_combo}: 'build/bundles/bundle.{FEATURE_COMBO}.js',
bundle_{feature_combo}_min: 'build/bundles/bundle.{FEATURE_COMBO}.min.js',
bundle_{feature_combo}_debug_min: 'build/bundles/bundle.{FEATURE_COMBO}.debug.min.js',
```

### 7. `.github/workflows/build.yml`

Add to the bundle matrix (in the `job_browser_playwright_tests` job):

```yaml
- bundle_{feature_combo}
```

## Verification Steps

After making changes:

1. Run `yarn lint` to check for linting issues
2. Run `cd packages/browser && yarn build:dev` to verify TypeScript compilation
3. Run `cd packages/browser && yarn test` to run the unit tests

## Reference: Existing Bundle Examples

Look at these existing bundles for reference:

- `packages/browser/src/index.bundle.tracing.ts` - Tracing only
- `packages/browser/src/index.bundle.replay.ts` - Replay only
- `packages/browser/src/index.bundle.tracing.replay.ts` - Tracing + Replay
- `packages/browser/src/index.bundle.logs.metrics.ts` - Logs + Metrics

## Error Handling

- **Invalid feature combination**: Validate feature names are valid (tracing, replay, feedback, logs, metrics)
- **Build failures**: Fix TypeScript errors before proceeding
- **Lint errors**: Run `yarn fix` to auto-fix common issues
- **Test failures**: Update test expectations to match the bundle's actual exports
