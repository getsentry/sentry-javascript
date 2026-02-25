import { afterEach, describe, expect, it, vi } from 'vitest';

const startSpanSpy = vi.fn((_, callback) => callback());
const flushIfServerlessSpy = vi.fn().mockResolvedValue(undefined);

vi.mock('@sentry/node', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    startSpan: (...args: unknown[]) => startSpanSpy(...args),
  };
});

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    flushIfServerless: (...args: unknown[]) => flushIfServerlessSpy(...args),
  };
});

// Import after mocks are set up
const { wrapFetchWithSentry } = await import('../../src/server/wrapFetchWithSentry');

describe('wrapFetchWithSentry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls flushIfServerless after a regular request', async () => {
    const mockResponse = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/page');

    await serverEntry.fetch(request);

    expect(fetchFn).toHaveBeenCalled();
    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });

  it('calls flushIfServerless after a server function request', async () => {
    const mockResponse = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/_serverFn/abc123');

    await serverEntry.fetch(request);

    expect(startSpanSpy).toHaveBeenCalled();
    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });

  it('calls flushIfServerless even if the handler throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('handler error'));

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/page');

    await expect(serverEntry.fetch(request)).rejects.toThrow('handler error');

    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });
});
