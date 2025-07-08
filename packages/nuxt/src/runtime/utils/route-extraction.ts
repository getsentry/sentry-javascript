import { logger } from '@sentry/core';
import type { NuxtSSRContext } from 'nuxt/app';
import type { NuxtPage } from 'nuxt/schema';

/**
 * Extracts route information from the SSR context modules and URL.
 *
 * The function matches the requested URL against the build-time pages data. The build-time pages data
 * contains the routes that were generated during the build process, which allows us to set the parametrized route.
 *
 * @param ssrContextModules - The modules from the SSR context.
 * This is a Set of module paths that were used when loading one specific page.
 * Example: `Set(['app.vue', 'components/Button.vue', 'pages/user/[userId].vue'])`
 *
 * @param currentUrl - The requested URL string
 * Example: `/user/123`
 *
 * @param buildTimePagesData
 * An array of NuxtPage objects representing the build-time pages data.
 * Example: [{ name: 'some-path', path: '/some/path' }, { name: 'user-userId', path: '/user/:userId()' }]
 */
export function extractParametrizedRouteFromContext(
  ssrContextModules?: NuxtSSRContext['modules'],
  currentUrl?: NuxtSSRContext['url'],
  buildTimePagesData: NuxtPage[] = [],
): null | { parametrizedRoute: string } {
  if (!ssrContextModules || !currentUrl) {
    logger.warn('SSR context modules or URL is not available.');
    return null;
  }

  if (buildTimePagesData.length === 0) {
    return null;
  }

  const modulesArray = Array.from(ssrContextModules);

  // Find the route data that corresponds to a module in ssrContext.modules
  const foundRouteData = buildTimePagesData.find(routeData => {
    if (!routeData.file) return false;

    return modulesArray.some(module => {
      // Extract the folder name and relative path from the page file
      // e.g., 'pages/test-param/[param].vue' -> folder: 'pages', path: 'test-param/[param].vue'
      const filePathParts = module.split('/');

      // Exclude root-level files (e.g., 'app.vue')
      if (filePathParts.length < 2) return false;

      // Normalize path separators to handle both Unix and Windows paths
      const normalizedRouteFile = routeData.file?.replace(/\\/g, '/');

      const pagesFolder = filePathParts[0];
      const pageRelativePath = filePathParts.slice(1).join('/');

      // Check if any module in ssrContext.modules ends with the same folder/relative path structure
      return normalizedRouteFile?.endsWith(`/${pagesFolder}/${pageRelativePath}`);
    });
  });

  const parametrizedRoute = foundRouteData?.path ?? null;

  return parametrizedRoute === null ? null : { parametrizedRoute };
}
