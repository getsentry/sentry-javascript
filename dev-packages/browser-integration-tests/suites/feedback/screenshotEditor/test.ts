import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipFeedbackTest } from '../../../utils/helpers';

async function drawBox(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 3 });
  await page.mouse.up();
}

sentryTest.beforeEach(async ({ getLocalTestUrl, page, browserName }) => {
  sentryTest.skip(shouldSkipFeedbackTest());
  sentryTest.skip(browserName !== 'chromium', 'The canvas screen-capture fixture requires Chromium.');

  await page.addInitScript(() => {
    // The fixture runs over HTTP, but screenshot capture is stubbed below.
    Object.defineProperty(window, 'isSecureContext', { value: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getDisplayMedia: async () => {
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
  await expect.poll(() => page.locator('#background').evaluate((canvas: HTMLCanvasElement) => canvas.width)).toBe(1600);
});

sentryTest('starts a highlight at the cursor inside an existing box', async ({ page }) => {
  const canvas = page.locator('#foreground');
  const bounds = (await canvas.boundingBox())!;
  const point = (x: number, y: number) => ({ x: bounds.x + x, y: bounds.y + y });
  await drawBox(page, point(80, 60), point(280, 240));
  await expect(page.locator('.editor__rect')).toHaveCount(1);
  const start = point(160, 140);
  const end = point(240, 200);

  await drawBox(page, start, end);

  await expect(page.locator('.editor__rect')).toHaveCount(2);
  const box = (await page.locator('.editor__rect').nth(1).boundingBox())!;
  expect(box.x).toBeCloseTo(start.x, 0);
  expect(box.y).toBeCloseTo(start.y, 0);
  expect(box.width).toBeCloseTo(end.x - start.x, 0);
  expect(box.height).toBeCloseTo(end.y - start.y, 0);
});

sentryTest('keeps background dimming unchanged while dragging another box', async ({ page }) => {
  const canvas = page.locator('#foreground');
  const bounds = (await canvas.boundingBox())!;
  const backgroundPixel = () =>
    canvas.evaluate((element: HTMLCanvasElement) =>
      Array.from(element.getContext('2d')!.getImageData(1400, 800, 1, 1).data),
    );
  await drawBox(page, { x: bounds.x + 80, y: bounds.y + 60 }, { x: bounds.x + 240, y: bounds.y + 180 });
  await expect(page.locator('.editor__rect')).toHaveCount(1);
  await expect.poll(backgroundPixel).toEqual([0, 0, 0, 64]);

  await page.mouse.move(bounds.x + 280, bounds.y + 60);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 360, bounds.y + 180, { steps: 3 });

  expect(await backgroundPixel()).toEqual([0, 0, 0, 64]);
  await page.mouse.up();
  await expect(page.locator('.editor__rect')).toHaveCount(2);
  await expect.poll(backgroundPixel).toEqual([0, 0, 0, 64]);
});
