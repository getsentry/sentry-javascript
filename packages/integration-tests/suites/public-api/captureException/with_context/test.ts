import { expect } from '@playwright/test';
import { EventHint } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should capture an error with provided hint context', async ({ getLocalTestPath, page, browserName }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'ReferenceError',
    value: browserName === 'webkit' ? `Can't find variable: undefinedFn` : 'undefinedFn is not defined',
    mechanism: {
      type: 'generic',
      handled: true,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
  expect((eventData as Event & { hint: EventHint }).hint.captureContext).toMatchObject({
    foo: 'bar',
  });
});
