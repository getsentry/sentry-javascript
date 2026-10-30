// @vitest-environment node
import type * as SentryCore from '@sentry/core';
import { getTraceMetaTags } from '@sentry/core';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { injectTraceMetaTags } from '../../src/cloudflare/index';

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getTraceMetaTags: vi.fn(),
}));

function streamFromChunks(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const REPLACEMENT_CHARACTER = '�';

describe('injectTraceMetaTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTraceMetaTags as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<meta name="sentry-trace" content="test-trace-id">',
    );
  });

  test('injects meta tags before the closing head tag', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([encoder.encode('<html><head></head><body>Test</body></html>')]);

    const output = new TextDecoder().decode(await readAll(injectTraceMetaTags(input)));

    expect(output).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
    expect(output).not.toContain('</head></head>');
  });

  test('preserves a multi-byte character split across chunk boundaries', async () => {
    // `©` is 0xC2 0xA9 in UTF-8. Splitting it across two chunks must not corrupt it.
    const encoder = new TextEncoder();
    const before = encoder.encode('<html><head></head><body><p>');
    const after = encoder.encode(' 2026</p></body></html>');

    const input = streamFromChunks([
      new Uint8Array([...before, 0xc2]), // first byte of `©`
      new Uint8Array([0xa9, ...after]), // second byte of `©`
    ]);

    const outputBytes = await readAll(injectTraceMetaTags(input));
    const output = new TextDecoder('utf-8', { fatal: false }).decode(outputBytes);

    expect(output).not.toContain(REPLACEMENT_CHARACTER);
    expect(output).toContain('<p>© 2026</p>');
    expect(output).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
  });

  test('preserves a multi-byte character split across a chunk after </head>', async () => {
    // The corruption is not limited to the `</head>` chunk: every chunk is round-tripped.
    const encoder = new TextEncoder();
    const head = encoder.encode('<html><head></head><body>');
    const tail = encoder.encode(' inside body</body></html>');

    const input = streamFromChunks([
      head,
      new Uint8Array([0xe2, 0x82]), // first two bytes of `€` (0xE2 0x82 0xAC)
      new Uint8Array([0xac, ...tail]), // final byte of `€`
    ]);

    const output = new TextDecoder('utf-8', { fatal: false }).decode(await readAll(injectTraceMetaTags(input)));

    expect(output).not.toContain(REPLACEMENT_CHARACTER);
    expect(output).toContain('€ inside body');
  });

  test('injects meta tags when </head> is split across chunks', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([encoder.encode('<html><head></he'), encoder.encode('ad><body>Test</body></html>')]);

    const output = new TextDecoder().decode(await readAll(injectTraceMetaTags(input)));

    expect(output).toBe(
      '<html><head><meta name="sentry-trace" content="test-trace-id"></head><body>Test</body></html>',
    );
  });

  test('preserves a multi-byte character split together with a split </head>', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([
      encoder.encode('<html><head></he'),
      new Uint8Array([...encoder.encode('ad><body><p>'), 0xc2]),
      new Uint8Array([0xa9, ...encoder.encode(' 2026</p></body></html>')]),
    ]);

    const output = new TextDecoder('utf-8', { fatal: false }).decode(await readAll(injectTraceMetaTags(input)));

    expect(output).not.toContain(REPLACEMENT_CHARACTER);
    expect(output).toContain('<meta name="sentry-trace" content="test-trace-id"></head><body><p>© 2026</p>');
  });

  test('flushes a held-back partial tag when the stream has no </head>', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([encoder.encode('<html><body></he')]);

    const output = new TextDecoder().decode(await readAll(injectTraceMetaTags(input)));

    expect(output).toBe('<html><body></he');
  });

  test('does not rely on the TransformStream constructor, which older workerd compatibility dates reject', async () => {
    vi.stubGlobal(
      'TransformStream',
      class {
        constructor() {
          throw new Error('TransformStream is not supported');
        }
      },
    );

    try {
      const input = streamFromChunks([new TextEncoder().encode('<html><head></head></html>')]);
      const output = new TextDecoder().decode(await readAll(injectTraceMetaTags(input)));

      expect(output).toContain('<meta name="sentry-trace" content="test-trace-id"></head>');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('keeps reading while a partial tag is held back so the stream does not stall', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([encoder.encode('<head><'), encoder.encode('/'), encoder.encode('head><body>')]);

    const output = new TextDecoder().decode(await readAll(injectTraceMetaTags(input)));

    expect(output).toBe('<head><meta name="sentry-trace" content="test-trace-id"></head><body>');
  });

  test('cancels the source stream when the consumer cancels', async () => {
    const cancel = vi.fn();
    const input = new ReadableStream({ cancel });

    await injectTraceMetaTags(input).cancel('done');

    expect(cancel).toHaveBeenCalledWith('done');
  });

  test('resolves the trace meta tags synchronously, before the stream is read', async () => {
    const encoder = new TextEncoder();
    const input = streamFromChunks([encoder.encode('<html><head></head></html>')]);

    const output = injectTraceMetaTags(input);

    expect(getTraceMetaTags).toHaveBeenCalledTimes(1);
    expect(new TextDecoder().decode(await readAll(output))).toContain('<meta name="sentry-trace"');
    expect(getTraceMetaTags).toHaveBeenCalledTimes(1);
  });
});
