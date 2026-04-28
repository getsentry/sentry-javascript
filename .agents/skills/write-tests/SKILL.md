---
name: write-tests
description: >
  Write high-quality unit tests (Vitest) and E2E tests (Playwright) following senior test-engineering
  practices. Use this skill whenever asked to write tests, add test coverage, create test cases,
  fix failing tests, add missing assertions, test a new feature, write specs, or cover edge cases.
  Also trigger when the user says "write tests for", "add tests", "test this", "cover this",
  "needs tests", "add E2E test", "add unit test", "test coverage", or when reviewing code and
  noticing missing test coverage.
---

# Write Tests

Tests are not production code. They are documentation — each one is a tiny executable spec that says
"this system does X." A reader should grasp the intent in seconds. A failure should point to exactly
one broken behavior, not leave you going through a 40-line test body.

## Workflow

Follow these steps in order before writing any test code.

1. **Decide the framework.** Testing a function's return value, side effects, or module interactions
   → Vitest (lives under `packages/<name>/test/`). Testing that a real HTTP request to a running app
   produces the correct Sentry envelope → Playwright (lives under
   `dev-packages/e2e-tests/test-applications/<app>/tests/`).

2. **Read 2–3 existing test files** in the target `test/` directory. Specifically note:
   - Which `vi.mock` style they use (string path or import form)
   - What cleanup they do in `beforeEach` (`clearAllMocks` vs `restoreAllMocks`)
   - How they import the module under test (`../../src/...` vs `@sentry/...`)
   - The `describe`/`it` nesting depth and naming style
   - What setup functions are called together — does the function under test require companion
     initialization? (e.g., does `patchRoute` also need `patchAppUse` to work correctly?)

   Match what you find. Consistency within a package matters more than idealized best practice.

3. **Check for existing test utilities** before writing helpers from scratch:
   - `packages/core/test/mocks/` — `TestClient`, `getDefaultTestClientOptions`, fake transports
   - `packages/core/test/testutils.ts` — `clearGlobalScope()`, version gating
   - `dev-packages/test-utils/` — `waitForTransaction`, `waitForError`, `waitForSession`,
     `getPlaywrightConfig`, mock Sentry server, event proxy
   - `dev-packages/node-integration-tests/utils/` — `createEsmAndCjsTests`, assertion helpers

4. **Identify the behaviors that matter most** — edge cases, error paths, boundary conditions.
   Don't aim for quantity; aim for the tests that would catch real regressions.

---

## Core principles

### Fewer tests, better tests

The goal is not to maximize test count. A large suite of shallow happy-path tests gives a false
sense of coverage — they pass on every change, including changes that introduce bugs. A smaller
suite that targets edge cases, error paths, and boundary conditions catches far more regressions.

Before writing a test, ask: "If this test didn't exist, what bug could ship?" If you can't answer
that concretely, the test probably isn't worth writing. Prioritize:

- **Edge cases and boundaries** — the off-by-one, the empty array, the `null` input
- **Error paths** — does the function fail gracefully or silently swallow the error?
- **Integration seams** — where two modules or systems interact (e.g., middleware calling `next()`)
- **Behavior that previously broke** — regression tests for known bugs

Don't waste tests on: trivial getters/setters, pure delegation to well-tested libraries,
TypeScript type constraints (the compiler already checks those), or re-testing the same behavior
that a higher-level test already covers.

### Arrange → Act → Assert

Structure every test with the AAA pattern, separated by blank lines. The whitespace makes the
phases obvious — no labels or comments needed.

```typescript
it('skips errors already captured by middleware', () => {
  const error = new Error('already captured');
  Object.defineProperty(error, '__sentry_captured__', { value: true });

  responseHandler(createMockContext(500, error));

  expect(mockCaptureException).not.toHaveBeenCalled();
});
```

### One behavior, one reason to fail

Each test makes exactly one behavioral claim. Multiple `expect` calls are fine when they assert on
different facets of the _same_ outcome. But if you're checking two unrelated behaviors, those are
two tests. No conditional logic, no branching, no try/catch — a test is a straight line.

### Assert behavior, not implementation

If someone refactored the internals but the function still returned the correct result, would this
test break? If yes, you're testing wiring, not behavior.

```typescript
// Bad: asserts nothing meaningful
it('handles the request', async () => {
  expect(() => handler(mockReq)).not.toThrow();
});

// Good: asserts on the observable outcome
it('sets transaction name from route path', () => {
  responseHandler(createMockContext(200));
  expect(mockSetTransactionName).toHaveBeenCalledWith('GET /test');
});
```

### Precise assertions

Default to exact matching. `toMatchObject`, `expect.objectContaining`, and `expect.arrayContaining`
silently ignore fields that matter. This has caused real bugs to ship in this codebase.

**Use `toEqual` unless you have a specific reason not to.** The same applies to
`toHaveBeenCalledWith` — spell out every argument rather than wrapping in `objectContaining`.
This is the single most common place where loose assertions creep in:

```typescript
// Bad: silently ignores any missing or extra properties in the call
expect(startSpan).toHaveBeenCalledWith(expect.objectContaining({ name: 'middleware', op: 'middleware.hono' }));

// Good: exact match on the full argument — if the shape changes, the test catches it
expect(startSpan).toHaveBeenCalledWith({
  name: 'middleware',
  op: 'middleware.hono',
  onlyIfParent: true,
  parentSpan: fakeRootSpan,
  attributes: { 'sentry.op': 'middleware.hono', 'sentry.origin': 'auto.middleware.hono' },
});
```

When you genuinely can't enumerate all fields (e.g., a large framework-generated object), fall
back to individual `.toBe()` checks on the fields that matter:

```typescript
expect(event.transaction).toBe('GET /users/:id');
expect(event.contexts?.trace?.op).toBe('http.server');
```

**Every `toContain` / `toContainEqual` needs a `toHaveLength` companion.** Without it, the
assertion passes even if the array has unexpected extra items:

```typescript
// Bad: doesn't notice extra unexpected spans
expect(spanNames).toContain('authMiddleware');

// Good: locks down both content and count
expect(spanNames).toHaveLength(1);
expect(spanNames).toContain('authMiddleware');
```

**Use exported constants, not magic numbers.** If the code under test uses named constants like
`SPAN_STATUS_OK`, reference those same constants in assertions. If the constant's value ever
changes, tests using magic numbers silently pass with wrong expectations.

### Naming

Names should be concise, descriptive, and read as correct English. Lead with the verb.

| Quality  | Example                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| **Good** | `'captures error when context.error is set'`                                              |
| **Good** | `'does not re-capture errors already captured by wrapMiddlewareWithSpan'`                 |
| **Good** | `'returns empty array when no items match'`                                               |
| **Bad**  | `'should correctly return the formatted price string when given a valid positive number'` |
| **Bad**  | `'test error handling'` / `'works correctly'`                                             |

Drop "should" — it adds words without adding meaning.

---

## Input quality

### Use realistic data

```typescript
// Weak
const url = 'http://test';

// Strong — exercises URL parsing, path handling, query strings
const url = 'https://api.example.com/users/42?include=profile&format=json';
```

### Boundary Value Analysis

If the valid range is 1–100, test 0, 1, 2, 99, 100, 101. Bugs cluster at boundaries — off-by-one
errors, inclusive/exclusive confusion, type coercion.

### Test the unhappy path as hard as the happy path

- **Empty inputs:** `''`, `[]`, `{}`, `undefined`, `null`
- **Falsy-but-valid:** `0`, `false`, `''`, `NaN` — these trip up loose truthiness checks
- **Error conditions:** network failure, malformed input, missing required fields, timeout
- **Concurrency:** what if called twice simultaneously? What if called after cleanup?

Each edge case gets its own test with a descriptive name.

---

## Writing Vitest tests

### File structure

- Name test files `*.test.ts`, mirroring the source path: `src/shared/patchRoute.ts` →
  `test/shared/patchRoute.test.ts`.
- Import from the source path (`../../src/...`), not from the package's published API.
- For browser-environment tests: `/** @vitest-environment jsdom */` at top of file.

### Mocking

**Prefer spies and stubs over full module mocks.** A spy observes behavior without replacing the
system under test. A full mock replaces it — and now you're testing your mock, not your code.

```typescript
const warnSpy = vi.spyOn(SentryCore.debug, 'warn');
sentry(app);
expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
```

**When you need `vi.mock`:** If the package's existing tests use string paths
(`vi.mock('../../src/utils')`), match that style. If you're creating the first test file for a
package, prefer the import form for type safety:

```typescript
vi.mock(import('../../src/utils'), async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, helperFn: vi.fn() };
});
```

**Always restore mocks.** This repo does _not_ set `restoreMocks: true` globally — you are
responsible for cleanup. Leaked mocks cause mysterious failures in unrelated tests. Use whatever
cleanup the existing tests in your package use. If creating the first test file, use:

```typescript
beforeEach(() => {
  vi.restoreAllMocks();
});
```

### Error testing

Use the library's built-in matchers. Never use try/catch in tests.

```typescript
expect(() => parseConfig(null)).toThrow('config is required');
await expect(asyncOp()).rejects.toThrow(TimeoutError);
```

For async callbacks where you need to verify an assertion actually ran, use `expect.assertions(n)`.

### Parameterized tests (Vitest)

Use `it.each` or `it.for` for data-driven cases — not raw `for` loops. `it.each` integrates with
the test runner, gives better output, and each case runs independently.

```typescript
it.each([
  { input: 0, expected: 'zero' },
  { input: 1, expected: 'one' },
  { input: -1, expected: 'negative' },
])('classifies $input as $expected', ({ input, expected }) => {
  expect(classify(input)).toBe(expected);
});
```

### Test isolation

Tests must never depend on execution order or share mutable state. For this codebase, many tests
need to reset global Sentry state:

```typescript
beforeEach(() => {
  clearGlobalScope();
  getCurrentScope().clear();
  getIsolationScope().clear();
});
```

### Grouping

Two levels of `describe` is usually enough. Deeper nesting makes tests harder to find and read.

```typescript
describe('patchRoute', () => {
  describe('sub-app middleware wrapping', () => {
    it('wraps .use() middleware handlers', async () => { ... });
    it('does not wrap sole route handlers', async () => { ... });
  });
});
```

---

## Writing Playwright E2E tests

### When to write E2E tests

Write E2E tests when you need to verify that the SDK correctly instruments a real application.
Unit tests can't catch integration bugs between the SDK and a framework's request lifecycle.
Also use the `/e2e` skill for running E2E tests.

### File structure

- Tests live in `dev-packages/e2e-tests/test-applications/<app-name>/tests/*.test.ts`.
- Shared constants (like `APP_NAME`) go in `tests/constants.ts`.
- Each test app has a `playwright.config.ts` using `getPlaywrightConfig` from
  `@sentry-internal/test-utils`.

### The waitFor pattern

Set up a promise for the expected Sentry event, trigger the action, then await and assert.

```typescript
test('captures transaction for GET /users/:id', async ({ baseURL }) => {
  const transactionPromise = waitForTransaction(APP_NAME, event => {
    return event.contexts?.trace?.op === 'http.server' && event.transaction === 'GET /users/:id';
  });

  const response = await fetch(`${baseURL}/users/42`);
  expect(response.status).toBe(200);

  const transaction = await transactionPromise;
  expect(transaction.contexts?.trace?.op).toBe('http.server');
  expect(transaction.transaction).toBe('GET /users/:id');
});
```

**The predicate must be specific enough to match only your event.** A vague predicate can match an
unrelated event from a parallel test, causing flaky passes or hangs.

### Asserting on spans

Prefer asserting on the exact span count alongside individual field checks:

```typescript
const spans = transaction.spans || [];
expect(spans).toHaveLength(2);

const middlewareSpan = spans.find(s => s.description === 'middlewareA');
expect(middlewareSpan?.op).toBe('middleware.hono');
expect(middlewareSpan?.origin).toBe('auto.middleware.hono');
expect(middlewareSpan?.status).toBe('ok');
```

### Error event assertions

Check both the exception value and the mechanism. The mechanism tells you _how_ the error was
captured — that's the SDK's actual responsibility:

```typescript
const errorEvent = await errorPromise;
expect(errorEvent.exception?.values?.[0]?.value).toBe('connection refused');

const mechanism = errorEvent.exception?.values?.[0]?.mechanism;
expect(mechanism?.handled).toBe(false);
expect(mechanism?.type).toBe('auto.http.hono.context_error');
```

### Parameterized E2E tests

For Playwright tests (unlike Vitest), `for...of` loops are the established codebase convention.
Use `for...of` (not `.forEach()`) so Playwright's test registration works correctly:

```typescript
for (const { name, prefix } of SCENARIOS) {
  test.describe(name, () => {
    test('captures named middleware span', async ({ baseURL }) => {
      // ...
    });
  });
}
```

### Common pitfalls

- **Proxy name mismatch:** `APP_NAME` must match `proxyServerName` in `start-event-proxy.mjs`.
- **Flaky predicates:** Add enough specificity (path, method, unique marker) to disambiguate.
- **Forgetting `await`:** The `waitFor*` helpers return a promise. Without `await`, the test passes
  vacuously and the assertion never runs.

---

## Checklist

Before you're done, verify each test against these criteria:

- [ ] Catches a real potential bug — not just confirming the happy path works
- [ ] Single, clear reason it could fail
- [ ] Description reads as a behavior specification (no "should", no "works correctly")
- [ ] No dependency on other tests' execution or state
- [ ] Mocks and spies are restored (via `beforeEach`)
- [ ] Edge cases covered: empty inputs, boundaries, error paths, null/undefined
- [ ] Realistic test data (not `"foo"`, `"test"`, `123`)
- [ ] No try/catch for error testing — `toThrow` / `rejects.toThrow` only
- [ ] Assertions use `toEqual` by default; `toHaveBeenCalledWith` spells out full arguments
- [ ] Array lookups (`toContain`, `toContainEqual`) paired with `toHaveLength`
- [ ] Uses exported constants (e.g., `SPAN_STATUS_OK`) instead of magic numbers
- [ ] Passes in isolation (`vitest run <file>` or single Playwright test)
- [ ] Matches the existing conventions of the package's test directory
