import { afterEach, describe, expect, it, vi } from 'vitest';
import { SentrySpan } from '../../../src/tracing/sentrySpan';

// must be var, because vi.mock hoists
var debugBuild: boolean = true;
vi.mock(import('../../../src/debug-build'), () => ({
  get DEBUG_BUILD() {
    return debugBuild ?? true;
  },
}));

describe('logSpans', () => {
  afterEach(() => {
    debugBuild = true;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logs span start and end in debug builds', async () => {
    const { logSpanEnd, logSpanStart } = await import('../../../src/tracing/logSpans');
    const { debug } = await import('../../../src/utils/debug-logger');
    const logSpy = vi.spyOn(debug, 'log').mockImplementation(() => {});
    const span = new SentrySpan({ name: 'test span', op: 'test.op', sampled: true });

    logSpanStart(span);
    logSpanEnd(span);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Tracing] Starting sampled root span'));
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[Tracing] Finishing "test.op" root span "test span" with ID ${span.spanContext().spanId}`,
      ),
    );
  });

  it('is a no-op in non-debug builds', async () => {
    debugBuild = false;
    const { logSpanEnd, logSpanStart } = await import('../../../src/tracing/logSpans');
    const { debug } = await import('../../../src/utils/debug-logger');
    const logSpy = vi.spyOn(debug, 'log').mockImplementation(() => {});
    const span = new SentrySpan({ name: 'test span', op: 'test.op', sampled: true });

    logSpanStart(span);
    logSpanEnd(span);

    expect(logSpy).not.toHaveBeenCalled();
  });
});
