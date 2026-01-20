import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TelemetrySpanBuffer, TelemetryBuffer } from '../../../src/telemetry-processor/telemetry-buffer';
import { Span } from '../../../src';

// vitest doesn't mock performance.now when using fake timers
// jury rig it to rely on Date.now()
const start = Date.now();
performance.now = () => Date.now() - start;

beforeAll(() => {
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

type FakeSpan = {
  id: string;
  traceId: string;
  spanContext(): { traceId: string };
};

function getFakeSpan(id: string, traceId: string): Span {
  return {
    id,
    traceId,
    spanContext() {
      return { traceId: (this as FakeSpan).traceId };
    },
  } as unknown as Span;
}

describe('TelemetryBuffer', async () => {
  const drops: [string, string][] = [];
  const options = {
    capacity: 10,
    batchSize: 5,
    timeout: 100,
    onDrop: (item: string, reason: string) => drops.push([item, reason]),
  };
  const buf = new TelemetryBuffer<string>(options);
  let poll: Promise<string[]> | undefined = undefined;

  it('validates constructor arguments', () => {
    expect(
      () =>
        new TelemetryBuffer<number>({
          capacity: 10,
          batchSize: 100,
          timeout: 0,
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize must be < capacity'), {
        cause: { capacity: 10, batchSize: 100 },
      }),
    );

    expect(
      () =>
        new TelemetryBuffer<number>({
          capacity: 0,
          batchSize: 0,
          timeout: 0,
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize and capacity must be > 0'), {
        cause: { capacity: 0, batchSize: 0 },
      }),
    );

    expect(
      () =>
        new TelemetryBuffer<number>({
          capacity: 100,
          batchSize: 10,
          timeout: -100,
        }),
    ).toThrowError(
      Object.assign(new TypeError('timeout must be >= 0'), {
        cause: { timeout: -100 },
      }),
    );
  });

  it('can fill to capacity while polling', () => {
    for (const a of Array.from('abc')) buf.offer(a);

    // not ready, will resolve when data is ready.
    poll = buf.poll().then(batch => {
      poll = undefined;
      expect(batch).toStrictEqual(Array.from('abcde'));
      return batch;
    });
    buf.poll();

    // put in 2 batches of items, plus one more to drop something
    for (const a of Array.from('defghij')) buf.offer(a);
  });

  it('drops extra elements', () => {
    expect(buf.size).toBe(5);
    for (const a of Array.from('klmn')) buf.offer(a);
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(9);
    buf.offer('o');
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(10);
    buf.offer('p');
    expect(drops).toStrictEqual([['f', 'buffer_full_drop_oldest']]);
    expect(buf.size).toBe(10);
    drops.length = 0;
  });

  it('can drop the other direction', () => {
    const buf = new TelemetryBuffer<string>({
      ...options,
      overflowPolicy: 'drop_newest',
    });
    for (const a of Array.from('abcdefghij')) buf.offer(a);
    buf.offer('k');
    expect(drops).toStrictEqual([['k', 'buffer_full_drop_newest']]);
    drops.length = 0;
  });

  it('can poll for data', async () => {
    expect(poll).toBe(undefined);
    poll = buf.poll();
    expect(await poll).toStrictEqual(Array.from('ghijk'));
    expect(buf.pollIfReady()).toStrictEqual(Array.from('lmnop'));
    expect(buf.pollIfReady()).toBe(undefined);
  });

  it('can set a timeout to send an incomplete batch', async () => {
    // now we should be empty, so time passing has no effect.
    vi.advanceTimersByTime(50);

    // put less than a full bactch in
    let polledBatch: undefined | string[];
    poll = buf.poll().then(batch => {
      polledBatch = batch;
      poll = undefined;
      return batch;
    });

    for (const a of Array.from('qrst')) buf.offer(a);
    expect(buf.size).toBe(4);
    expect(polledBatch).toBe(undefined);
    expect(buf.pollIfReady()).toBe(undefined);

    await vi.advanceTimersByTimeAsync(55);

    expect(polledBatch).toBe(undefined);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);

    expect(polledBatch).toStrictEqual(Array.from('qrst'));
  });

  it('can be flushed', () => {
    const buf = new TelemetryBuffer<string>(options);
    expect(buf.flush()).toBe(undefined);
    for (const a of Array.from('abcd')) buf.offer(a);
    expect(buf.size).toBe(4);
    expect(buf.flush()).toStrictEqual(Array.from('abcd'));
    expect(buf.size).toBe(0);
  });

  it('can be cleared', () => {
    const buf = new TelemetryBuffer<string>(options);
    expect(buf.clear()).toBe(undefined);
    for (const a of Array.from('abcd')) buf.offer(a);
    expect(buf.size).toBe(4);
    expect(buf.clear()).toBe(undefined);
    expect(buf.size).toBe(0);
  });
});

describe('TelemetryBucketBuffer', async () => {
  const drops: [Span[], string][] = [];
  const options = {
    capacity: 10,
    batchSize: 5,
    timeout: 100,
    onDrop: (bucket: Span[], reason: string) => drops.push([bucket, reason]),
  };
  const buf = new TelemetrySpanBuffer(options);
  let poll: Promise<Span[]> | undefined = undefined;

  let traceCtr = -1;

  it('validates constructor arguments', () => {
    expect(
      () =>
        new TelemetrySpanBuffer({
          capacity: 10,
          batchSize: 100,
          timeout: 0,
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize must be < capacity'), {
        cause: { capacity: 10, batchSize: 100 },
      }),
    );

    expect(
      () =>
        new TelemetrySpanBuffer({
          capacity: 0,
          batchSize: 0,
          timeout: 0,
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize and capacity must be > 0'), {
        cause: { capacity: 0, batchSize: 0 },
      }),
    );

    expect(
      () =>
        new TelemetrySpanBuffer({
          capacity: 100,
          batchSize: 10,
          timeout: -100,
        }),
    ).toThrowError(
      Object.assign(new TypeError('timeout must be >= 0'), {
        cause: { timeout: -100 },
      }),
    );
  });

  it('can fill to capacity while polling', async () => {
    for (const a of Array.from('abc')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }

    // not ready, will resolve when data is ready.
    poll = buf.poll().then(batch => {
      poll = undefined;
      expect(batch).toMatchObject([
        { id: 'a', traceId: '0' },
        { id: 'd', traceId: '0' },
      ]);
      return batch;
    });
    buf.poll();

    // put in 2 batches of items, plus one more to drop something
    traceCtr = -1;
    for (const a of Array.from('defghij')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
  });

  it('drops extra elements', () => {
    buf.pollIfReady();
    expect(buf.size).toBe(5);
    expect(buf.bucketCount).toBe(2);
    for (const a of Array.from('klmn')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(9);
    buf.offer(getFakeSpan('o', String((traceCtr = (traceCtr + 1) % 3))));
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(10);
    buf.offer(getFakeSpan('p', String((traceCtr = (traceCtr + 1) % 3))));
    expect(drops).toMatchObject([
      [
        [
          { id: 'c', traceId: '2' },
          { id: 'f', traceId: '2' },
          { id: 'i', traceId: '2' },
          { id: 'l', traceId: '2' },
          { id: 'o', traceId: '2' },
        ],
        'buffer_full_drop_oldest',
      ],
    ]);
    expect(buf.size).toBe(6);
    drops.length = 0;
  });

  it('can drop the other direction', () => {
    const buf = new TelemetrySpanBuffer({
      ...options,
      overflowPolicy: 'drop_newest',
    });
    for (const a of Array.from('abcdefghij')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
    buf.offer(getFakeSpan('k', String((traceCtr = (traceCtr + 1) % 3))));
    expect(drops).toMatchObject([[[{ id: 'k', traceId: '2' }], 'buffer_full_drop_newest']]);
    drops.length = 0;
  });

  it('can poll for data', async () => {
    expect(poll).toBe(undefined);
    poll = buf.poll();
    expect(await poll).toMatchObject([
      { id: 'g', traceId: '0' },
      { id: 'j', traceId: '0' },
      { id: 'm', traceId: '0' },
      { id: 'p', traceId: '0' },
    ]);
    expect(buf.pollIfReady()).toBe(undefined);
  });

  it('can set a timeout to send an incomplete batch', async () => {
    // now we should be empty, so time passing has no effect.
    vi.advanceTimersByTime(50);

    // put less than a full bactch in
    let polledBatch: undefined | Span[];
    poll = buf.poll().then(batch => {
      polledBatch = batch;
      poll = undefined;
      return batch;
    });

    for (const a of Array.from('qrst')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
    expect(buf.size).toBe(6);
    expect(polledBatch).toStrictEqual(undefined);
    expect(buf.pollIfReady()).toMatchObject([
      {
        id: 'k',
        traceId: '1',
      },
      {
        id: 'n',
        traceId: '1',
      },
      {
        id: 'r',
        traceId: '1',
      },
    ]);

    await vi.advanceTimersByTimeAsync(55);

    expect(polledBatch).toMatchObject([
      { id: 'g', traceId: '0' },
      { id: 'j', traceId: '0' },
      { id: 'm', traceId: '0' },
      { id: 'p', traceId: '0' },
    ]);
    await vi.advanceTimersByTimeAsync(500);

    expect(polledBatch).toMatchObject([
      { id: 'g', traceId: '0' },
      { id: 'j', traceId: '0' },
      { id: 'm', traceId: '0' },
      { id: 'p', traceId: '0' },
    ]);
  });

  it('can be flushed', () => {
    const buf = new TelemetrySpanBuffer(options);
    expect(buf.flush()).toBe(undefined);
    for (const a of Array.from('abcd')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
    expect(buf.size).toBe(4);
    expect([...buf]).toMatchObject([
      [
        { id: 'a', traceId: '1' },
        { id: 'd', traceId: '1' },
      ],
      [{ id: "b", traceId: "2" }],
      [{ id: "c", traceId: "0" }],
    ]);
    expect(buf.flush()).toMatchObject([
      { id: 'a', traceId: '1' },
      { id: 'd', traceId: '1' },
    ]);
    expect(buf.flush()).toMatchObject([{ id: "b", traceId: "2" }])
    expect(buf.flush()).toMatchObject([{ id: "c", traceId: "0" }])
    expect(buf.size).toBe(0);
  });

  it('can be cleared', () => {
    const buf = new TelemetrySpanBuffer(options);
    expect(buf.clear()).toBe(undefined);
    for (const a of Array.from('abcd')) {
      buf.offer(getFakeSpan(a, String((traceCtr = (traceCtr + 1) % 3))));
    }
    expect(buf.size).toBe(4);
    expect(buf.clear()).toBe(undefined);
    expect(buf.size).toBe(0);
  });
});
