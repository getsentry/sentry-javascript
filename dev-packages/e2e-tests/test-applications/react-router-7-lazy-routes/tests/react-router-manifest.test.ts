import { expect, test, Page } from '@playwright/test';

/**
 * Canary tests: React Router route manifest exposure
 *
 * These tests verify that React Router doesn't expose lazy-loaded routes in `router.routes`
 * before navigation completes. They will fail when React Router changes this behavior.
 *
 * - Tests pass when React Router doesn't expose lazy routes (current behavior)
 * - Tests fail when React Router does expose lazy routes (future behavior)
 *
 * If these tests fail, React Router may now expose lazy routes natively, and the
 * `lazyRouteManifest` workaround might no longer be needed. Check React Router's changelog
 * and consider updating the SDK to use native route exposure.
 *
 * Note: `router.routes` is the documented way to access routes when using RouterProvider.
 * See: https://github.com/remix-run/react-router/discussions/10857
 */

/**
 * Extracts all route paths from the React Router instance exposed on window.__REACT_ROUTER__.
 * Recursively traverses the route tree and builds full path strings.
 */
async function extractRoutePaths(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const router = (window as Record<string, unknown>).__REACT_ROUTER__ as
      | { routes?: Array<{ path?: string; children?: unknown[] }> }
      | undefined;
    if (!router?.routes) return [];

    const paths: string[] = [];
    function traverse(routes: Array<{ path?: string; children?: unknown[] }>, parent = ''): void {
      for (const r of routes) {
        const full = r.path ? (r.path.startsWith('/') ? r.path : `${parent}/${r.path}`) : parent;
        if (r.path) paths.push(full);
        if (r.children) traverse(r.children as Array<{ path?: string; children?: unknown[] }>, full);
      }
    }
    traverse(router.routes);
    return paths;
  });
}

test.describe('[CANARY] React Router Route Manifest Exposure', () => {
  /**
   * Verifies that lazy routes are not pre-populated in router.routes.
   * If lazy routes appear in the initial route tree, React Router has changed behavior.
   */
  test('React Router should not expose lazy routes before lazy handler resolves', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    const initialRoutes = await extractRoutePaths(page);
    const hasSlowFetchInitially = initialRoutes.some(p => p.includes('/slow-fetch/:id'));

    // Test passes if routes are not available initially (we need the workaround)
    // Test fails if routes are available initially (workaround may not be needed!)
    expect(
      hasSlowFetchInitially,
      `
React Router now exposes lazy routes in the initial route tree!
This means the lazyRouteManifest workaround may no longer be needed.

Initial routes: ${JSON.stringify(initialRoutes, null, 2)}

Next steps:
1. Verify this behavior is consistent and intentional
2. Check React Router changelog for details
3. Consider removing the lazyRouteManifest workaround
`,
    ).toBe(false);
  });

  /**
   * Verifies that lazy route children are not in router.routes before visiting them.
   */
  test('React Router should not have lazy route children before visiting them', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(300);

    const routes = await extractRoutePaths(page);
    const hasLazyChildren = routes.some(
      p =>
        p.includes('/lazy/inner/:id') ||
        p.includes('/another-lazy/sub/:id') ||
        p.includes('/slow-fetch/:id') ||
        p.includes('/deep/level2/level3/:id'),
    );

    // Test passes if lazy children are not in routes before visiting (we need the workaround)
    // Test fails if lazy children are in routes before visiting (workaround may not be needed!)
    expect(
      hasLazyChildren,
      `
React Router now includes lazy route children in router.routes upfront!
This means the lazyRouteManifest workaround may no longer be needed.

Routes at home page: ${JSON.stringify(routes, null, 2)}

Next steps:
1. Verify this behavior is consistent and intentional
2. Check React Router changelog for details
3. Consider removing the lazyRouteManifest workaround
`,
    ).toBe(false);
  });
});
