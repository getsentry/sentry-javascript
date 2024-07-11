import { describe, expect, test } from 'vitest';

import { Miniflare } from 'miniflare';

describe('index', () => {
  test('simple test', async () => {
    const mf = new Miniflare({
      scriptPath: './test/fixtures/worker.mjs',
      modules: true,
      port: 8787,
    });

    const res = await mf.dispatchFetch('http://localhost:8787/');
    expect(await res.text()).toBe('Hello Sentry!');
    await mf.dispose();
  });
});
