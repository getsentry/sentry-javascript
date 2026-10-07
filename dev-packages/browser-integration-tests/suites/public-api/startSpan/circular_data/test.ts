import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'drops circular object attributes while preserving supported attributes on root and child spans',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });
    const rootPromise = waitForStreamedSpan(page, span => span.name === 'circular_object_test_transaction');
    const childPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'circular_object_test_span');
    await page.goto(url);

    const [rootSpan, childSpan] = await Promise.all([rootPromise, childPromise]);
    expect(rootSpan.is_segment).toBe(true);
    expect(childSpan.parent_span_id).toBe(rootSpan.span_id);
    expect(rootSpan.attributes.count).toEqual({ type: 'integer', value: 42 });
    expect(childSpan.attributes.count).toEqual({ type: 'integer', value: 42 });
    expect(rootSpan.attributes.chicken).toBeUndefined();
    expect(childSpan.attributes.chicken).toBeUndefined();
  },
);
