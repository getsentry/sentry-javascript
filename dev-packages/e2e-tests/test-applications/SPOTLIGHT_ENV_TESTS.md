# Spotlight Environment Variable E2E Tests

This document describes the E2E tests for Spotlight environment variable handling across different bundlers and module formats.

## Overview

The Sentry JavaScript SDK supports Spotlight configuration via environment variables. The implementation must handle:

1. **Multiple environment variable prefixes** for different frameworks (e.g., `NEXT_PUBLIC_*`, `VITE_*`)
2. **Different module formats** (ESM vs CJS)
3. **Different environment variable access methods** (`process.env` vs `import.meta.env`)
4. **Empty string filtering** (empty strings should be treated as undefined)

## Test Coverage

### Next.js Tests (`nextjs-15/tests/spotlight-env.test.ts`)

Tests the **CJS build** scenario where `import.meta` must be stripped to avoid syntax errors.

**Test Page**: `/spotlight-env-test`
**Source**: `nextjs-15/app/spotlight-env-test/page.tsx`

#### Tests:
1. **`respects NEXT_PUBLIC_SENTRY_SPOTLIGHT environment variable`**
   - Verifies that `NEXT_PUBLIC_SENTRY_SPOTLIGHT=true` enables Spotlight
   - Checks that the Spotlight integration is registered

2. **`NEXT_PUBLIC_SENTRY_SPOTLIGHT takes precedence over SENTRY_SPOTLIGHT`**
   - Verifies that `SENTRY_SPOTLIGHT` (backend-only) is not accessible in browser
   - Ensures framework-specific vars have priority

3. **`handles empty string environment variables correctly`**
   - Documents expected behavior: empty strings should disable Spotlight
   - Tests that `resolveSpotlightOptions` filters empty strings

4. **`process.env check works without errors in CJS build`**
   - **Critical test**: Verifies no `import.meta` syntax errors in CJS build
   - Checks that the rollup plugin successfully stripped ESM-only code
   - Monitors console for syntax errors

#### Environment Setup:
```bash
NEXT_PUBLIC_SENTRY_SPOTLIGHT=true
# SENTRY_SPOTLIGHT can be set for backend, but won't be exposed to browser
```

### Vite Tests (`browser-webworker-vite/tests/spotlight-env.test.ts`)

Tests the **ESM build** scenario where `import.meta` should be present and functional.

**Test Page**: `/spotlight-env-test.html`
**Source**: `browser-webworker-vite/src/spotlight-env-test.ts`

#### Tests:
1. **`respects VITE_SENTRY_SPOTLIGHT environment variable`**
   - Verifies that `VITE_SENTRY_SPOTLIGHT=true` enables Spotlight
   - Checks that the Spotlight integration is registered

2. **`import.meta.env is available in ESM build`**
   - **Critical test**: Verifies `import.meta` is present in ESM builds
   - Checks that `import.meta.env.VITE_SENTRY_SPOTLIGHT` is accessible
   - Confirms the build format is ESM

3. **`process.env also works via Vite transformation`**
   - Verifies that Vite transforms `process.env` references
   - Both `process.env` and `import.meta.env` should work

4. **`handles empty string environment variables correctly`**
   - Documents expected behavior for empty strings
   - Tests that `resolveSpotlightOptions` filters empty strings

5. **`no syntax errors from import.meta in ESM build`**
   - Verifies no syntax errors when using `import.meta`
   - Monitors console for errors

6. **`getEnvValue function works with import.meta.env`**
   - Tests the `getEnvValue` utility function
   - Verifies it successfully reads from `import.meta.env`

#### Environment Setup:
```bash
VITE_SENTRY_SPOTLIGHT=true
```

## Implementation Details

### Rollup Plugins

Two rollup plugins handle module-format-specific code:

1. **`makeStripEsmPlugin()`** - Strips ESM-only code from CJS builds
   - Removes code between `/* rollup-esm-only */` and `/* rollup-esm-only-end */`
   - Applied to all CJS builds

2. **`makeStripCjsPlugin()`** - Strips CJS-only code from ESM builds
   - Removes code between `/* rollup-cjs-only */` and `/* rollup-cjs-only-end */`
   - Applied to all ESM builds

### Source Code

**File**: `packages/browser/src/utils/env.ts`

The `import.meta.env` check is wrapped in special comments:

```typescript
/* rollup-esm-only */
// Check import.meta.env (Vite, Astro, SvelteKit, etc.)
try {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const value = import.meta.env[key];
    if (value !== undefined) {
      return value;
    }
  }
} catch (e) {
  // Silently ignore
}
/* rollup-esm-only-end */
```

This code is:
- **Included** in ESM builds (Vite, Astro, SvelteKit)
- **Stripped** from CJS builds (Next.js, Webpack, etc.)

### Empty String Handling

**File**: `packages/core/src/utils/resolveSpotlightOptions.ts`

The shared `resolveSpotlightOptions` function filters empty/whitespace strings:

```typescript
// Treat empty/whitespace-only strings as undefined
const envUrl = typeof envSpotlight === 'string' && envSpotlight.trim() !== ''
  ? envSpotlight
  : undefined;
```

This ensures:
- Empty strings never enable Spotlight
- Whitespace-only strings are treated as undefined
- No invalid URL connections are attempted

## Running the Tests

### Next.js Tests
```bash
cd dev-packages/e2e-tests/test-applications/nextjs-15
NEXT_PUBLIC_SENTRY_SPOTLIGHT=true pnpm test tests/spotlight-env.test.ts
```

### Vite Tests
```bash
cd dev-packages/e2e-tests/test-applications/browser-webworker-vite
VITE_SENTRY_SPOTLIGHT=true pnpm test tests/spotlight-env.test.ts
```

## Expected Outcomes

### Next.js (CJS)
- ✅ `process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT` accessible
- ✅ `SENTRY_SPOTLIGHT` NOT accessible (backend-only)
- ✅ No `import.meta` syntax in output
- ✅ No syntax errors
- ✅ Spotlight integration enabled

### Vite (ESM)
- ✅ `import.meta.env.VITE_SENTRY_SPOTLIGHT` accessible
- ✅ `process.env.VITE_SENTRY_SPOTLIGHT` accessible (transformed)
- ✅ `import.meta` syntax present in output
- ✅ No syntax errors
- ✅ Spotlight integration enabled

## Troubleshooting

### Syntax Error: Cannot use import.meta outside a module
- **Cause**: `import.meta` code not stripped from CJS build
- **Fix**: Verify `makeStripEsmPlugin()` is applied to CJS builds
- **Check**: Look for `/* rollup-esm-only */` comments in source

### Spotlight not enabled despite env var set
- **Cause**: Empty string or wrong prefix
- **Fix**: Use correct prefix (`NEXT_PUBLIC_*` for Next.js, `VITE_*` for Vite)
- **Check**: Verify `resolveSpotlightOptions` receives non-empty string

### import.meta.env returns undefined in Vite
- **Cause**: `import.meta` code stripped from ESM build
- **Fix**: Verify `makeStripEsmPlugin()` is NOT applied to ESM builds
- **Check**: ESM builds should only use `makeStripCjsPlugin()`
