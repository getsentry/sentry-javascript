import { describe, expect, it } from 'vitest';
import * as browserEntry from '../src/browser';
import * as rootEntry from '../src/index';
import { spanStreamingIntegration as browserSpanStreamingIntegration } from '../src/integrations/browserSpanStreaming';
import { spanStreamingIntegration as plainSpanStreamingIntegration } from '../src/integrations/spanStreaming';
import * as serverEntry from '../src/server';
import * as browserSpanApi from '../src/tracing/browserSpanApi';
import { startIdleSpan as plainStartIdleSpan } from '../src/tracing/idleSpan';
import {
  startInactiveSpan as plainStartInactiveSpan,
  startSpan as plainStartSpan,
  startSpanManual as plainStartSpanManual,
} from '../src/tracing/trace';

// `server-exports` and `browser-exports` export these names with different implementations, which
// makes them ambiguous star exports at the root entry. `index.ts` disambiguates them with explicit
// re-exports — if someone adds another `export *` that also carries one of these names, or drops the
// explicit re-export, the root entry silently flips to the wrong variant (or fails to link).
describe('entry point resolution', () => {
  const cases = [
    ['startSpan', plainStartSpan, browserSpanApi.startSpan],
    ['startInactiveSpan', plainStartInactiveSpan, browserSpanApi.startInactiveSpan],
    ['startSpanManual', plainStartSpanManual, browserSpanApi.startSpanManual],
    ['spanStreamingIntegration', plainSpanStreamingIntegration, browserSpanStreamingIntegration],
  ] as const;

  it.each(cases)('`%s`: the root entry serves the plain variant', (name, plain) => {
    expect(rootEntry[name]).toBe(plain);
  });

  it.each(cases)('`%s`: the server entry serves the plain variant', (name, plain) => {
    expect(serverEntry[name]).toBe(plain);
  });

  it.each(cases)('`%s`: the browser entry serves the browser variant', (name, plain, browser) => {
    expect(browserEntry[name]).toBe(browser);
    expect(browserEntry[name]).not.toBe(plain);
  });
});
