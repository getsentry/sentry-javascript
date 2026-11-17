import { expect } from '@playwright/test';
import type * as SentrySDK from '@sentry/browser';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipFeedbackTest } from '../../../utils/helpers';

sentryTest.beforeEach(async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipFeedbackTest());
  await page.goto(await getLocalTestUrl({ testDir: __dirname, handleLazyLoadedFeedback: true }));
});

sentryTest('names the native modal and restores focus after repeated keyboard dismissal @firefox', async ({ page }) => {
  const launcher = page.getByRole('button', { name: 'Report a Bug', exact: true });
  const dialog = page.locator('dialog');

  for (const key of ['Escape', 'Enter', 'Escape']) {
    await launcher.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleName('Report a Bug');
    await expect(dialog).toHaveJSProperty('open', true);
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();

    await page.locator('#background').evaluate(el => (el as HTMLElement).focus());
    await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();

    if (key === 'Enter') {
      await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    } else {
      await page.getByRole('textbox', { name: 'Name', exact: true }).focus();
    }
    await page.keyboard.press(key);
    await expect(dialog).not.toBeVisible();
    await expect(launcher).toBeFocused();
  }
});

sentryTest('keeps keyboard navigation inside the modal @firefox', async ({ page }) => {
  await page.getByRole('button', { name: 'Report a Bug', exact: true }).click();
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Powered by Sentry' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).not.toBeVisible();
});

sentryTest('returns to a custom launcher inside another native modal @firefox', async ({ page }) => {
  await page.evaluate(() => {
    const { Sentry } = window as unknown as { Sentry: typeof SentrySDK };
    const parent = document.createElement('dialog');
    parent.id = 'parent-modal';
    document.body.appendChild(parent);
    parent.appendChild(document.querySelector('#background')!);
    parent.showModal();
    Sentry.getFeedback()!.attachTo('#background', {
      formTitle: 'Custom feedback title',
      showName: false,
      showEmail: false,
      showBranding: false,
      enableScreenshot: false,
    });
  });
  const launcher = page.getByRole('button', { name: 'Background control' });
  await launcher.click();
  await expect(page.getByRole('dialog', { name: 'Custom feedback title' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();
  expect(await page.locator('#parent-modal').evaluate(el => el.matches(':modal'))).toBe(true);
});

sentryTest('dismisses on backdrop click and restores focus @firefox', async ({ page }) => {
  const launcher = page.getByRole('button', { name: 'Report a Bug', exact: true });
  await launcher.focus();
  await page.keyboard.press('Enter');
  await page.locator('dialog').click({ position: { x: 1, y: 1 } });
  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(launcher).toBeFocused();
});

sentryTest(
  'programmatic close and removal release modal state and preserve body overflow @firefox',
  async ({ page }) => {
    const launcher = page.locator('#background');
    await launcher.focus();
    const form = await page.evaluateHandle(async () => {
      const { Sentry } = window as unknown as { Sentry: typeof SentrySDK };
      document.body.style.overflow = 'scroll';
      const form = await Sentry.getFeedback()!.createForm();
      form.appendToDom();
      return form;
    });

    for (const remove of [false, true]) {
      await form.evaluate(form => {
        form.open();
        form.open();
      });
      await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
      await form.evaluate((form, remove) => (remove ? form.removeFromDom() : form.close()), remove);
      await expect(page.locator('dialog:modal')).toHaveCount(0);
      await expect(launcher).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('scroll');
    }
    await form.evaluate(form => {
      form.appendToDom();
      form.open();
    });
    await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
  },
);

sentryTest('restores the launcher after successful submission @firefox', async ({ page }) => {
  const launcher = page.getByRole('button', { name: 'Report a Bug', exact: true });
  await launcher.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Description' }).fill('Feedback sent to the local test transport');
  await page.getByRole('button', { name: 'Send Bug Report' }).click();
  await expect(page.locator('dialog:modal')).toHaveCount(0);
  await expect(page.locator('.success__content')).toBeVisible();
  await page.locator('.success__content').click();
  await expect(launcher).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
});

sentryTest('preserves input border overrides @firefox', async ({ page }) => {
  await page.locator('#sentry-feedback').evaluate(el => {
    (el as HTMLElement).style.setProperty('--input-border', '2px solid rgb(0, 0, 255)');
  });
  await page.getByRole('button', { name: 'Report a Bug', exact: true }).click();
  await expect(page.locator('[name="name"]')).toHaveCSS('border-top-color', 'rgb(0, 0, 255)');
  await expect(page.locator('[name="name"]')).toHaveCSS('border-top-width', '2px');
});

sentryTest('keeps the form usable without native dialog methods @firefox', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: undefined });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { value: undefined });
  });
  const launcher = page.getByRole('button', { name: 'Report a Bug', exact: true });
  for (const key of ['Escape', 'Enter']) {
    await launcher.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Report a Bug' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Powered by Sentry' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press(key);
    await expect(page.locator('dialog')).not.toBeVisible();
    await expect(launcher).toBeFocused();
  }
});

for (const scheme of ['light', 'dark'] as const) {
  sentryTest(`enabled input boundaries have 3:1 contrast in ${scheme} mode @firefox`, async ({ page }) => {
    await page.evaluate(scheme => {
      const { Sentry } = window as unknown as { Sentry: typeof SentrySDK };
      Sentry.getFeedback()!.setTheme(scheme);
    }, scheme);
    await page.getByRole('button', { name: 'Report a Bug', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();

    for (const name of ['name', 'email', 'message']) {
      const contrast = await page.locator(`[name="${name}"]`).evaluate(el => {
        const rgb = (color: string): number[] => color.match(/[\d.]+/g)!.map(Number);
        const background = rgb(getComputedStyle(el.closest('.dialog__content')!).backgroundColor);
        const border = rgb(getComputedStyle(el).borderTopColor);
        const alpha = border[3] ?? 1;
        const composited = border.slice(0, 3).map((channel, i) => channel * alpha + background[i] * (1 - alpha));
        const luminance = (channels: number[]): number =>
          channels.slice(0, 3).reduce((sum, channel, i) => {
            const value = channel / 255;
            return (
              sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i]
            );
          }, 0);
        const a = luminance(composited);
        const b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(3);
    }
  });
}
