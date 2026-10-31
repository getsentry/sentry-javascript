import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipFeedbackTest } from '../../../utils/helpers';

type CaptureWindow = Window & { framesWithoutFormAtCapture?: number };

// Whether the capture still shows the form depends on how busy the machine is, so this counts the frames the page
// drew with the form hidden by the time the capture is requested instead.
sentryTest(
  'draws two frames without the feedback form before it asks for the screen capture',
  async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipFeedbackTest());
    sentryTest.skip(browserName !== 'chromium', 'The canvas screen-capture fixture requires Chromium.');

    await page.addInitScript(() => {
      // The fixture runs over HTTP, but screenshot capture is stubbed below.
      Object.defineProperty(window, 'isSecureContext', { value: true });

      let framesWithoutForm = 0;
      const countFrame = (): void => {
        const form = document
          .getElementById('sentry-feedback')
          ?.shadowRoot?.querySelector('dialog.dialog')?.parentElement;
        if (form?.style.display === 'none') {
          framesWithoutForm += 1;
        }
        requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getDisplayMedia: async () => {
            (window as CaptureWindow).framesWithoutFormAtCapture = framesWithoutForm;
            const canvas = document.createElement('canvas');
            canvas.width = 1600;
            canvas.height = 1000;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return canvas.captureStream();
          },
        },
        configurable: true,
      });
    });

    await page.goto(await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true }));
    await page.getByRole('button', { name: 'Report a Bug', exact: true }).click();
    await page.getByRole('button', { name: 'Add a screenshot', exact: true }).click();
    await expect(page.locator('#foreground')).toBeVisible();

    const framesWithoutForm = await page.evaluate(() => (window as CaptureWindow).framesWithoutFormAtCapture);
    expect(framesWithoutForm).toBeGreaterThanOrEqual(2);
  },
);
