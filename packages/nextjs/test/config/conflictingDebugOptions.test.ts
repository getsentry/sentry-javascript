import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const TEST_DSN = 'https://public@dsn.ingest.sentry.io/1337';

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

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://example.com/' });

    originalDocument = (globalThis as any).document;
    originalLocation = (globalThis as any).location;
    originalAddEventListener = (globalThis as any).addEventListener;

    Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true });
    Object.defineProperty(globalThis, 'location', { value: dom.window.location, writable: true });
    Object.defineProperty(globalThis, 'addEventListener', { value: () => undefined, writable: true });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'document', { value: originalDocument, writable: true });
    Object.defineProperty(globalThis, 'location', { value: originalLocation, writable: true });
    Object.defineProperty(globalThis, 'addEventListener', { value: originalAddEventListener, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock('../../src/common/debug-build.js');
    delete process.env.NEXT_OTEL_FETCH_DISABLED;
    delete process.env.NEXT_PHASE;
  });

  it('warns on client/server/edge when debug is true but DEBUG_BUILD is false', async () => {
    vi.doMock('../../src/common/debug-build.js', () => ({ DEBUG_BUILD: false }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = await import('../../src/client/index.js');
    client.init({ dsn: TEST_DSN, debug: true } as any);

    const server = await import('../../src/server/index.js');
    server.init({ dsn: TEST_DSN, debug: true } as any);

    const edge = await import('../../src/edge/index.js');
    edge.init({ dsn: TEST_DSN, debug: true } as any);

    expect(didWarnAboutDebugRemoved(warnSpy)).toBe(true);
  });

  it('does not emit that warning when DEBUG_BUILD is true', async () => {
    vi.doMock('../../src/common/debug-build.js', () => ({ DEBUG_BUILD: true }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const client = await import('../../src/client/index.js');
    client.init({ dsn: TEST_DSN, debug: true } as any);

    const server = await import('../../src/server/index.js');
    server.init({ dsn: TEST_DSN, debug: true } as any);

    const edge = await import('../../src/edge/index.js');
    edge.init({ dsn: TEST_DSN, debug: true } as any);

    expect(didWarnAboutDebugRemoved(warnSpy)).toBe(false);
  });
});
