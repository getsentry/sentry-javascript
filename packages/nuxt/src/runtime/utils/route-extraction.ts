import { debug } from '@sentry/core';
import type { NuxtSSRContext } from 'nuxt/app';
import type { NuxtPage } from 'nuxt/schema';

export type NuxtPageSubset = { path: NuxtPage['path']; file: NuxtPage['file'] };

const extractionResultCache = new Map<string, null | { parametrizedRoute: string }>();

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
 * @param requestedUrl - The requested URL string
 * Example: `/user/123`
 *
 * @param buildTimePagesData
 * An array of NuxtPage objects representing the build-time pages data.
 * Example: [{ file: '/a/file/pages/some/path', path: '/some/path' }, { file: '/a/file/pages/user/[userId].vue', path: '/user/:userId()' }]
 */
export function extractParametrizedRouteFromContext(
  ssrContextModules?: NuxtSSRContext['modules'],
  requestedUrl?: NuxtSSRContext['url'],
  buildTimePagesData: NuxtPageSubset[] = [],
): null | { parametrizedRoute: string } {
  if (!ssrContextModules || !requestedUrl) {
    return null;
  }

  if (buildTimePagesData.length === 0) {
    return null;
  }

  const cacheKey = Array.from(ssrContextModules).sort().join('|');
  const cachedResult = extractionResultCache.get(cacheKey);
  if (cachedResult !== undefined) {
    debug.log('Found cached result for parametrized route:', requestedUrl);
    return cachedResult;
  }

  debug.log('No parametrized route found in cache lookup. Extracting parametrized route for:', requestedUrl);

  const modulesArray = Array.from(ssrContextModules);

  const modulePagePaths = modulesArray.map(module => {
    const filePathParts = module.split('/');

    // Exclude root-level files (e.g., 'app.vue')
    if (filePathParts.length < 2) return null;

    const pagesFolder = filePathParts[0];
    const pageRelativePath = filePathParts.slice(1).join('/');
    return `/${pagesFolder}/${pageRelativePath}`;
  });

  for (const routeData of buildTimePagesData) {
    if (routeData.file && routeData.path) {
      // Handle Windows paths
      const normalizedFile = routeData.file.replace(/\\/g, '/');

      // Check if any module of the requested page ends with the same folder/relative path structure as the parametrized filePath from build time.
      if (modulePagePaths.some(filePath => filePath && normalizedFile.endsWith(filePath))) {
        const result = { parametrizedRoute: routeData.path };
        extractionResultCache.set(cacheKey, result);
        return result;
      }
    }
  }

  extractionResultCache.set(cacheKey, null);
  return null;
}
