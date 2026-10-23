import type { Page } from '@playwright/test';

type NuxtRootContainer = HTMLElement & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } };

// Server-rendered elements are clickable before Vue hydration attaches their event handlers.
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (document.getElementById('__nuxt') as NuxtRootContainer | null)?.__vue_app__?.$nuxt?.isHydrating === false,
  );
}
