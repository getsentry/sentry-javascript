import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TelemetryBucketBuffer, TelemetryBuffer } from '../../../src/telemetry-processor/telemetry-buffer';

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

  it('can stream through as an async iterator', async () => {
    const buf = new TelemetryBuffer<string>(options);
    let done = false;
    const stream = async () => {
      const results: string[][] = [];
      for await (const batch of buf) {
        results.push(batch);
        if (done && !buf.size) {
          break;
        }
      }
      return results;
    };
    const p = stream();
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('abcd')) buf.offer(a);
    expect([...buf]).toStrictEqual(Array.from('abcd'));
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('efgh')) buf.offer(a);
    expect([...buf]).toStrictEqual(Array.from('fgh'));
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('ijkl')) buf.offer(a);
    expect([...buf]).toStrictEqual(Array.from('kl'));
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('mnop')) buf.offer(a);
    expect([...buf]).toStrictEqual(Array.from('p'));

    done = true;

    vi.advanceTimersByTimeAsync(100);

    expect(await p).toStrictEqual([Array.from('abcde'), Array.from('fghij'), Array.from('klmno'), ['p']]);
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
  type Item = { id: string; trace_id: string };
  const drops: [Item[], string][] = [];
  const options = {
    capacity: 10,
    batchSize: 5,
    timeout: 100,
    onDrop: (bucket: Item[], reason: string) => drops.push([bucket, reason]),
    getBucket: (item: Item) => item.trace_id,
  };
  const buf = new TelemetryBucketBuffer<Item>(options);
  let poll: Promise<Item[]> | undefined = undefined;

  let traceCtr = -1;

  it('validates constructor arguments', () => {
    expect(
      () =>
        new TelemetryBucketBuffer<string>({
          capacity: 10,
          batchSize: 100,
          timeout: 0,
          getBucket: () => 'x',
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize must be < capacity'), {
        cause: { capacity: 10, batchSize: 100 },
      }),
    );

    expect(
      () =>
        new TelemetryBucketBuffer<number>({
          capacity: 0,
          batchSize: 0,
          timeout: 0,
          getBucket: () => 'x',
        }),
    ).toThrowError(
      Object.assign(new TypeError('batchSize and capacity must be > 0'), {
        cause: { capacity: 0, batchSize: 0 },
      }),
    );

    expect(
      () =>
        new TelemetryBucketBuffer<number>({
          capacity: 100,
          batchSize: 10,
          timeout: -100,
          getBucket: () => 'x',
        }),
    ).toThrowError(
      Object.assign(new TypeError('timeout must be >= 0'), {
        cause: { timeout: -100 },
      }),
    );
  });

  it('can fill to capacity while polling', async () => {
    for (const a of Array.from('abc')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }

    // not ready, will resolve when data is ready.
    poll = buf.poll().then(batch => {
      poll = undefined;
      expect(batch).toStrictEqual([
        { id: 'a', trace_id: '0' },
        { id: 'd', trace_id: '0' },
        { id: 'b', trace_id: '1' },
        { id: 'e', trace_id: '1' },
        { id: 'c', trace_id: '2' },
      ]);
      return batch;
    });
    buf.poll();

    // put in 2 batches of items, plus one more to drop something
    traceCtr = -1;
    for (const a of Array.from('defghij')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
  });

  it('drops extra elements', () => {
    expect(buf.size).toBe(5);
    expect(buf.bucketCount).toBe(3);
    for (const a of Array.from('klmn')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(9);
    buf.offer({
      id: 'o',
      trace_id: String((traceCtr = (traceCtr + 1) % 3)),
    });
    expect(drops).toStrictEqual([]);
    expect(buf.size).toBe(10);
    buf.offer({
      id: 'p',
      trace_id: String((traceCtr = (traceCtr + 1) % 3)),
    });
    expect(drops).toStrictEqual([
      [
        [
          { id: 'f', trace_id: '2' },
          { id: 'i', trace_id: '2' },
          { id: 'l', trace_id: '2' },
          { id: 'o', trace_id: '2' },
        ],
        'buffer_full_drop_oldest',
      ],
    ]);
    expect(buf.size).toBe(7);
    drops.length = 0;
  });

  it('can drop the other direction', () => {
    const buf = new TelemetryBucketBuffer<Item>({
      ...options,
      overflowPolicy: 'drop_newest',
    });
    for (const a of Array.from('abcdefghij')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    buf.offer({
      id: 'k',
      trace_id: String((traceCtr = (traceCtr + 1) % 3)),
    });
    expect(drops).toStrictEqual([[[{ id: 'k', trace_id: '2' }], 'buffer_full_drop_newest']]);
    drops.length = 0;
  });

  it('can poll for data', async () => {
    expect(poll).toBe(undefined);
    poll = buf.poll();
    expect(await poll).toStrictEqual([
      { id: 'g', trace_id: '0' },
      { id: 'j', trace_id: '0' },
      { id: 'm', trace_id: '0' },
      { id: 'p', trace_id: '0' },
    ]);
    expect(buf.pollIfReady()).toBe(undefined);
  });

  it('can set a timeout to send an incomplete batch', async () => {
    // now we should be empty, so time passing has no effect.
    vi.advanceTimersByTime(50);

    // put less than a full bactch in
    let polledBatch: undefined | Item[];
    poll = buf.poll().then(batch => {
      polledBatch = batch;
      poll = undefined;
      return batch;
    });

    for (const a of Array.from('qrst')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect(buf.size).toBe(7);
    expect(polledBatch).toStrictEqual(undefined);
    expect(buf.pollIfReady()).toStrictEqual([
      {
        id: 'h',
        trace_id: '1',
      },
      {
        id: 'k',
        trace_id: '1',
      },
      {
        id: 'n',
        trace_id: '1',
      },
      {
        id: 'r',
        trace_id: '1',
      },
    ]);

    await vi.advanceTimersByTimeAsync(55);

    expect(polledBatch).toStrictEqual([
      { id: 'g', trace_id: '0' },
      { id: 'j', trace_id: '0' },
      { id: 'm', trace_id: '0' },
      { id: 'p', trace_id: '0' },
    ]);
    await vi.advanceTimersByTimeAsync(500);

    expect(polledBatch).toStrictEqual([
      { id: 'g', trace_id: '0' },
      { id: 'j', trace_id: '0' },
      { id: 'm', trace_id: '0' },
      { id: 'p', trace_id: '0' },
    ]);
  });

  it('can stream through as an async iterator', async () => {
    const buf = new TelemetryBucketBuffer<Item>(options);
    let done = false;
    const stream = async () => {
      const results: Item[][] = [];
      for await (const batch of buf) {
        results.push(batch);
        if (done && !buf.size) {
          break;
        }
      }
      return results;
    };
    const p = stream();
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('abcd')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect([...buf]).toStrictEqual([
      [
        { id: 'a', trace_id: '1' },
        { id: 'd', trace_id: '1' },
      ],
      [{ id: 'b', trace_id: '2' }],
      [{ id: 'c', trace_id: '0' }],
    ]);
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('efgh')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect([...buf]).toStrictEqual([
      [{ id: 'f', trace_id: '0' }],
      [{ id: 'g', trace_id: '1' }],
      [{ id: 'h', trace_id: '2' }],
    ]);
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('ijkl')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect([...buf]).toStrictEqual([[{ id: 'k', trace_id: '2' }], [{ id: 'l', trace_id: '0' }]]);
    await vi.advanceTimersByTimeAsync(75);
    for (const a of Array.from('mnop')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect([...buf]).toStrictEqual([[{ id: 'p', trace_id: '1' }]]);

    done = true;

    vi.advanceTimersByTimeAsync(100);

    expect(await p).toStrictEqual([
      [
        { id: 'a', trace_id: '1' },
        { id: 'd', trace_id: '1' },
        { id: 'b', trace_id: '2' },
        { id: 'e', trace_id: '2' },
        { id: 'c', trace_id: '0' },
      ],
      [
        { id: 'f', trace_id: '0' },
        { id: 'i', trace_id: '0' },
        { id: 'g', trace_id: '1' },
        { id: 'j', trace_id: '1' },
        { id: 'h', trace_id: '2' },
      ],
      [
        { id: 'k', trace_id: '2' },
        { id: 'n', trace_id: '2' },
        { id: 'l', trace_id: '0' },
        { id: 'o', trace_id: '0' },
        { id: 'm', trace_id: '1' },
      ],
      [{ id: 'p', trace_id: '1' }],
    ]);
  });

  it('can be flushed', () => {
    const buf = new TelemetryBucketBuffer<Item>(options);
    expect(buf.flush()).toBe(undefined);
    for (const a of Array.from('abcd')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect(buf.size).toBe(4);
    expect(buf.flush()).toStrictEqual([
      { id: 'a', trace_id: '2' },
      { id: 'd', trace_id: '2' },
      { id: 'b', trace_id: '0' },
      { id: 'c', trace_id: '1' },
    ]);
    expect(buf.size).toBe(0);
  });

  it('can be cleared', () => {
    const buf = new TelemetryBucketBuffer<Item>(options);
    expect(buf.clear()).toBe(undefined);
    for (const a of Array.from('abcd')) {
      buf.offer({
        id: a,
        trace_id: String((traceCtr = (traceCtr + 1) % 3)),
      });
    }
    expect(buf.size).toBe(4);
    expect(buf.clear()).toBe(undefined);
    expect(buf.size).toBe(0);
  });
});
