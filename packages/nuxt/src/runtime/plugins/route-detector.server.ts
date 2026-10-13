import { debug } from '@sentry/core';
import { defineNuxtPlugin } from 'nuxt/app';
import type { NuxtPageSubset } from '../utils/route-extraction';
import { extractParametrizedRouteFromContext } from '../utils/route-extraction';
import { setHttpServerSpanRouteAttribute } from '@sentry/server-utils';

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

    setHttpServerSpanRouteAttribute(routeInfo.parametrizedRoute);
  });
});
