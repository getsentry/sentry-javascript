import { debug, getActiveSpan, getRootSpan, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { defineNuxtPlugin } from 'nuxt/app';
import type { NuxtPageSubset } from '../utils/route-extraction';
import { extractParametrizedRouteFromContext } from '../utils/route-extraction';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hooks.hook('app:rendered', async renderContext => {
    let buildTimePagesData: NuxtPageSubset[];
    try {
      // Virtual module registered via addServerTemplate in module.ts (Nuxt v4+)
      // @ts-expect-error - This is a virtual module
      const { default: importedPagesData } = await import('#sentry/nuxt-pages-data.mjs');
      buildTimePagesData = importedPagesData || [];
      debug.log('Imported build-time pages data:', buildTimePagesData);
    } catch (error) {
      buildTimePagesData = [];
      debug.warn('Failed to import build-time pages data:', error);
    }

    const ssrContext = renderContext.ssrContext;

    const routeInfo = extractParametrizedRouteFromContext(
      ssrContext?.modules,
      ssrContext?.url || ssrContext?.event._path,
      buildTimePagesData,
    );

    if (routeInfo === null) {
      return;
    }

    const activeSpan = getActiveSpan(); // In development mode, getActiveSpan() is always undefined

    if (activeSpan && routeInfo.parametrizedRoute) {
      const rootSpan = getRootSpan(activeSpan);

      if (!rootSpan) {
        return;
      }

      debug.log('Matched parametrized server route:', routeInfo.parametrizedRoute);

      rootSpan.setAttributes({
        [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
        'http.route': routeInfo.parametrizedRoute,
      });
    }
  });
});
