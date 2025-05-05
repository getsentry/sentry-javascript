import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('should capture an AggregateError with embedded errors', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(4); // AggregateError + 3 embedded errors

  // Verify the embedded errors come first
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'RangeError',
    value: 'Third error message',
    mechanism: {
      type: 'chained',
      handled: true,
      source: expect.stringMatching(/^errors\[\d+\]$/),
      exception_id: expect.any(Number),
    },
  });

  expect(eventData.exception?.values?.[1]).toMatchObject({
    type: 'TypeError',
    value: 'Second error message',
    mechanism: {
      type: 'chained',
      handled: true,
      source: expect.stringMatching(/^errors\[\d+\]$/),
      exception_id: expect.any(Number),
    },
  });

  expect(eventData.exception?.values?.[2]).toMatchObject({
    type: 'Error',
    value: 'First error message',
    mechanism: {
      type: 'chained',
      handled: true,
      source: expect.stringMatching(/^errors\[\d+\]$/),
      exception_id: expect.any(Number),
    },
  });

  // Verify the AggregateError comes last
  expect(eventData.exception?.values?.[3]).toMatchObject({
    type: 'AggregateError',
    value: 'Multiple errors occurred',
    mechanism: {
      type: 'generic',
      handled: true,
      is_exception_group: true,
      exception_id: expect.any(Number),
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });

  // Get parent exception ID for reference checks
  const parentId = eventData.exception?.values?.[3].mechanism?.exception_id;

  // Verify parent_id references match for all child errors
  for (let i = 0; i < 3; i++) {
    expect(eventData.exception?.values?.[i].mechanism?.parent_id).toBe(parentId);
  }
});
