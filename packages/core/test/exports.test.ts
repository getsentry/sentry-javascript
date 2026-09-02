import { describe, expect, it } from 'vitest';
import * as browserEntry from '../src/browser';
import * as rootEntry from '../src/index';
import { spanStreamingIntegration } from '../src/integrations/spanStreaming';
import * as serverEntry from '../src/server';
import * as browserSpanApi from '../src/tracing/browserSpanApi';
import {
  startInactiveSpan as plainStartInactiveSpan,
  startSpan as plainStartSpan,
  startSpanManual as plainStartSpanManual,
} from '../src/tracing/trace';

// The span-start APIs exist in two variants under the same name: the plain ones (`./tracing/trace`)
// and the browser ones (`./tracing/browserSpanApi`) that install `spanStreamingIntegration` before
// starting the span. The isomorphic root entry disambiguates to the plain variant with explicit
// re-exports — if someone adds another `export *` that also carries one of these names, or drops the
// explicit re-export, the root entry silently flips to the wrong variant (or fails to link). The
// browser entry serves the guarded variant, and the server entry is disjoint from the isomorphic
// surface, so it deliberately does not re-export these APIs at all.
describe('entry point resolution', () => {
  const cases = [
    ['startSpan', plainStartSpan, browserSpanApi.startSpan],
    ['startInactiveSpan', plainStartInactiveSpan, browserSpanApi.startInactiveSpan],
    ['startSpanManual', plainStartSpanManual, browserSpanApi.startSpanManual],
  ] as const;

  it.each(cases)('`%s`: the root entry serves the plain variant', (name, plain) => {
    expect(rootEntry[name]).toBe(plain);
  });

  it.each(cases)('`%s`: the browser entry serves the browser variant', (name, plain, browser) => {
    expect(browserEntry[name]).toBe(browser);
    expect(browserEntry[name]).not.toBe(plain);
  });

  it.each(cases)('`%s`: the server entry does not re-export the isomorphic API', name => {
    expect(serverEntry).not.toHaveProperty(name);
  });

  // `spanStreamingIntegration` is isomorphic and lives only on the root entry. The platform entries
  // are disjoint from the isomorphic surface, so they deliberately do not re-export it.
  it('`spanStreamingIntegration`: the root entry serves it', () => {
    expect(rootEntry.spanStreamingIntegration).toBe(spanStreamingIntegration);
  });

  it.each(['server', 'browser'] as const)('`spanStreamingIntegration`: the %s entry does not re-export it', entry => {
    const entries = { server: serverEntry, browser: browserEntry };
    expect(entries[entry]).not.toHaveProperty('spanStreamingIntegration');
  });
});
