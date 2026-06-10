import { describe, expectTypeOf, it } from 'vitest';
import { onRequest } from '../../../src/integration/middleware';

describe('Integration middleware types', () => {
  // Regression test for #21413: the published `@sentry/astro/middleware` declaration must stay
  // framework-agnostic. Typing `onRequest` against Astro-version-specific aliases (such as
  // `MiddlewareResponseHandler`) made the public type depend on an export that is absent in some
  // supported Astro versions. The assertions below fail on that previous typing and pass with the fix.
  it('exposes onRequest as a framework-agnostic middleware handler', () => {
    expectTypeOf(onRequest).toBeFunction();
    expectTypeOf(onRequest).parameters.toEqualTypeOf<[unknown, () => Promise<Response>]>();
    expectTypeOf(onRequest).returns.toEqualTypeOf<Promise<Response> | Response | Promise<void> | void>();
  });

  it('is callable with a minimal context and a zero-argument next', () => {
    expectTypeOf(onRequest).toBeCallableWith({}, () => Promise.resolve(new Response()));
  });
});
