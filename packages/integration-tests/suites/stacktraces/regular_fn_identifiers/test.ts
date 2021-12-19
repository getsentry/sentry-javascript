import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import { getSentryRequest } from '../../../utils/helpers';

sentryTest('should parse function identifiers correctly', async ({ getLocalTestPath, page, browserName }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
    browserName === 'chromium'
      ? [
          { function: '?' },
          { function: '?' },
          { function: 'qux' },
          { function: '?' },
          { function: '?' },
          { function: 'foo' },
          { function: 'bar' },
          { function: 'Function.baz' },
        ]
      : browserName === 'firefox'
      ? [
          { function: '?' },
          { function: '?' },
          { function: 'qux' },
          { function: 'qux/<' },
          { function: 'qux/</<' },
          { function: 'foo' },
          { function: 'bar' },
          { function: 'baz' },
        ]
      : [
          { function: 'global code' },
          { function: '?' },
          { function: 'qux' },
          { function: '?' },
          { function: '?' },
          { function: 'foo' },
          { function: 'bar' },
          { function: 'baz' },
        ],
  );
});

sentryTest('should not add any part of the function identifier inside filename', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
    Array(8).fill({ filename: expect.stringMatching(/^file:\/?/) }),
  );
});
