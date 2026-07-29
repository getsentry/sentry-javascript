import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { countEnvelopes, waitForSession } from '../../../utils/helpers';

sentryTest(
  'marks session as unhandled when unhandled error is sampled out by sampleRate',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
    await page.goto(url);
    const pageloadSession = await pageloadSessionPromise;

    const updatedSessionPromise = waitForSession(page, s => !s.init && s.status !== 'ok');
    const errorCountPromise = countEnvelopes(page, { envelopeType: 'event', timeout: 2000 });
    await page.locator('#throw-error').click();
    const updatedSession = await updatedSessionPromise;
    const errorCount = await errorCountPromise;

    // The error event is not sent — it was sampled out
    expect(errorCount).toBe(0);

    // But the session update is still sent, reflecting the crash
    expect(updatedSession.sid).toBe(pageloadSession.sid);
    expect(updatedSession.errors).toBe(1);
    expect(updatedSession.status).toBe('crashed');
  },
);

sentryTest(
  'marks session as errored when handled exception is sampled out by sampleRate',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadSessionPromise = waitForSession(page, s => !!s.init && s.status === 'ok');
    await page.goto(url);
    const pageloadSession = await pageloadSessionPromise;

    const updatedSessionPromise = waitForSession(page, s => !s.init);
    const errorCountPromise = countEnvelopes(page, { envelopeType: 'event', timeout: 2000 });
    await page.locator('#capture-exception').click();
    const updatedSession = await updatedSessionPromise;
    const errorCount = await errorCountPromise;

    // The error event is not sent — it was sampled out
    expect(errorCount).toBe(0);

    // But the session update is still sent, recording the error
    expect(updatedSession.sid).toBe(pageloadSession.sid);
    expect(updatedSession.errors).toBe(1);
    expect(updatedSession.status).toBe('ok');
  },
);
