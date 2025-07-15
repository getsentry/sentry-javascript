import { debug, getActiveSpan, getRootSpan, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/core';
import { defineNuxtPlugin } from 'nuxt/app';
import type { NuxtPageSubset } from '../utils/route-extraction';
import { extractParametrizedRouteFromContext } from '../utils/route-extraction';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hooks.hook('app:rendered', async renderContext => {
    let buildTimePagesData: NuxtPageSubset[];
    try {
      // This is a common Nuxt pattern to import build-time generated data: https://nuxt.com/docs/4.x/api/kit/templates#creating-a-virtual-file-for-runtime-plugin
      // @ts-expect-error This import is dynamically resolved at build time (`addTemplate` in module.ts)
      const { default: importedPagesData } = await import('#build/sentry--nuxt-pages-data.mjs');
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
