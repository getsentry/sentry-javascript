import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { waitForSession } from '../../../utils/helpers';

sentryTest(
  'starts a new session on pageload with user id',
  async ({ getLocalTestUrl, page }) => {
    const initialSessionPromise = waitForSession(page, (s) => !!s.init);
    const updatedSessionPromise = waitForSession(page, (s) => !s.init);

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const initialSession = await initialSessionPromise;
    const updatedSession = await updatedSessionPromise;

    expect(initialSession).toEqual({
      attrs: {
        environment: 'production',
        release: '0.1',
        user_agent:
          expect.any(String),
      },
      errors: 0,
      init: true,
      sid: expect.any(String),
      started: expect.any(String),
      status: 'ok',
      timestamp: expect.any(String),
    });

    expect(updatedSession).toEqual({
      init: false,
      errors: 1,
      status: 'crashed',
      sid: initialSession.sid,
    });
  },
);
