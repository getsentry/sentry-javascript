import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as client from '../../src/client/index.js';
import * as edge from '../../src/edge/index.js';
import * as server from '../../src/server/index.js';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

const debugBuild = vi.hoisted(() => ({ value: true }));

// The entry points read `DEBUG_BUILD` inside `init()`, so a getter lets each test switch it without
// re-importing the SDK module graphs.
vi.mock('../../src/common/debug-build.js', () => ({
  get DEBUG_BUILD() {
    return debugBuild.value;
  },
}));

function didWarnAboutDebugRemoved(warnSpy: ReturnType<typeof vi.spyOn>): boolean {
  return warnSpy.mock.calls.some(call =>
    call.some(
      arg =>
        typeof arg === 'string' &&
        arg.includes('You have enabled `debug: true`') &&
        arg.includes('debug logging was removed from your bundle'),
    ),
  );
}

describe('debug: true + removeDebugLogging warning', () => {
  let dom: JSDOM;
  let originalDocument: unknown;
  let originalLocation: unknown;
  let originalAddEventListener: unknown;
  let originalRemoveEventListener: unknown;

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/' });

    originalDocument = (globalThis as any).document;
    originalLocation = (globalThis as any).location;
    originalAddEventListener = (globalThis as any).addEventListener;
    originalRemoveEventListener = (globalThis as any).removeEventListener;

    Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(globalThis, 'location', { value: dom.window.location, writable: true });
    Object.defineProperty(globalThis, 'addEventListener', { value: () => undefined, writable: true });
    Object.defineProperty(globalThis, 'removeEventListener', { value: () => undefined, writable: true });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'document', { value: originalDocument, writable: true });
    Object.defineProperty(globalThis, 'location', { value: originalLocation, writable: true });
    Object.defineProperty(globalThis, 'addEventListener', { value: originalAddEventListener, writable: true });
    Object.defineProperty(globalThis, 'removeEventListener', { value: originalRemoveEventListener, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    debugBuild.value = true;
    delete process.env.NEXT_OTEL_FETCH_DISABLED;
    delete process.env.NEXT_PHASE;
  });

  it('warns on client/server/edge when debug is true but DEBUG_BUILD is false', () => {
    debugBuild.value = false;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    client.init({ dsn: TEST_DSN, debug: true } as any);
    server.init({ dsn: TEST_DSN, debug: true } as any);
    edge.init({ dsn: TEST_DSN, debug: true } as any);

    expect(didWarnAboutDebugRemoved(warnSpy)).toBe(true);
  });

  it('does not emit that warning when DEBUG_BUILD is true', () => {
    debugBuild.value = true;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    client.init({ dsn: TEST_DSN, debug: true } as any);
    server.init({ dsn: TEST_DSN, debug: true } as any);
    edge.init({ dsn: TEST_DSN, debug: true } as any);

    expect(didWarnAboutDebugRemoved(warnSpy)).toBe(false);
  });
});
