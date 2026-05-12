import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest(
  'attaches thread.id and thread.name to streamed spans (trace mode)',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const spansPromise = waitForStreamedSpans(page, receivedSpans => {
      return receivedSpans.some(s => s.name === 'root-fibonacci');
    });

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
    await page.goto(url);

    const spans = await spansPromise;

    const rootSpan = spans.find(s => s.name === 'root-fibonacci');
    expect(rootSpan).toBeDefined();

    expect(rootSpan!.attributes?.['thread.id']).toEqual({ type: 'string', value: '0' });
    expect(rootSpan!.attributes?.['thread.name']).toEqual({ type: 'string', value: 'main' });

    const childSpans = spans.filter(s => s.name === 'child-span-1' || s.name === 'child-span-2');
    expect(childSpans.length).toBeGreaterThanOrEqual(1);

    for (const child of childSpans) {
      expect(child.attributes?.['thread.id']).toEqual({ type: 'string', value: '0' });
      expect(child.attributes?.['thread.name']).toEqual({ type: 'string', value: 'main' });
    }
  },
);
