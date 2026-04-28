import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { waitForSession } from '../../../utils/helpers';

sentryTest(
  'should start new sessions on pushState navigation with route lifecycle (default).',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const initSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
    await page.goto(url);
    const initSession = await initSessionPromise;

    const session1Promise = waitForSession(page, s => !!s.init && s.status === 'ok' && s.sid !== initSession.sid);
    await page.locator('#navigate').click();
    const session1 = await session1Promise;

    const session2Promise = waitForSession(page, s => !!s.init && s.status === 'ok' && s.sid !== session1.sid);
    await page.locator('#navigate').click();
    const session2 = await session2Promise;

    const session3Promise = waitForSession(page, s => !!s.init && s.status === 'ok' && s.sid !== session2.sid);
    await page.locator('#navigate').click();
    const session3 = await session3Promise;

    // Verify we got 4 distinct init sessions (1 initial + 3 navigations)
    const sids = new Set([initSession.sid, session1.sid, session2.sid, session3.sid]);
    expect(sids.size).toBe(4);
  },
);
