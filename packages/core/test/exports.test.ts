import { describe, expect, it } from 'vitest';
import * as browserEntry from '../src/browser';
import * as rootEntry from '../src/index';
import { spanStreamingIntegration } from '../src/integrations/spanStreaming';
import * as serverEntry from '../src/server';
import {
  startInactiveSpan as plainStartInactiveSpan,
  startSpan as plainStartSpan,
  startSpanManual as plainStartSpanManual,
} from '../src/tracing/trace';

// The isomorphic span-start APIs (`startSpan`, `startInactiveSpan`, `startSpanManual`) live only on the
// root entry, which serves the plain variant from `./tracing/trace`. The guarded browser variant - the
// one that installs `spanStreamingIntegration` before starting a span - lives in `@sentry/browser-utils`,
// not here, so none of core's platform entries re-export these APIs. If someone adds another `export *`
// that carries one of these names, the root entry could silently flip to a different variant (or fail to
// link), which is what this guards against.
describe('entry point resolution', () => {
  const cases = [
    ['startSpan', plainStartSpan],
    ['startInactiveSpan', plainStartInactiveSpan],
    ['startSpanManual', plainStartSpanManual],
  ] as const;

  it.each(cases)('`%s`: the root entry serves the plain variant', (name, plain) => {
    expect(rootEntry[name]).toBe(plain);
  });

  it.each(cases)('`%s`: the platform entries do not re-export the isomorphic API', name => {
    expect(serverEntry).not.toHaveProperty(name);
    expect(browserEntry).not.toHaveProperty(name);
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
