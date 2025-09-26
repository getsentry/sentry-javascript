import { expect } from '@playwright/test';
import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'wrapped callback should preserve correct context - window (not-bound)',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const { outsideCtx, requestAnimationFrameCtx } = (await page.evaluate(() => {
      return new Promise(resolve => {
        const outsideCtx = window as any;
        requestAnimationFrame(function () {
          // @ts-expect-error re-assigning this
          resolve({ outsideCtx, requestAnimationFrameCtx: this });
        });
      });
    })) as any;
    expect(requestAnimationFrameCtx).toBe(outsideCtx);
  },
);

sentryTest(
  'wrapped callback should preserve correct context - `bind` bound method',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const requestAnimationFrameCtx = (await page.evaluate(() => {
      return new Promise(resolve => {
        function foo() {
          // @ts-expect-error re-assigning this
          resolve(this);
        }

        requestAnimationFrame(foo.bind({ magicNumber: 42 }));
      });
    })) as any;

    expect(requestAnimationFrameCtx.magicNumber).toBe(42);
  },
);
