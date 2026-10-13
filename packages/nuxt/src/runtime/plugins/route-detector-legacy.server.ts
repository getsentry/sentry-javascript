import { debug } from '@sentry/core';
import { defineNuxtPlugin } from 'nuxt/app';
import type { NuxtPageSubset } from '../utils/route-extraction';
import { extractParametrizedRouteFromContext } from '../utils/route-extraction';
import { setHttpServerSpanRouteAttribute } from '@sentry/server-utils';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hooks.hook('app:rendered', async renderContext => {
    let buildTimePagesData: NuxtPageSubset[];
    try {
      // This is a common Nuxt pattern to import build-time generated data (until Nuxt v3): https://nuxt.com/docs/4.x/api/kit/templates#creating-a-virtual-file-for-runtime-plugin
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

    if (routeInfo.parametrizedRoute) {
      setHttpServerSpanRouteAttribute(routeInfo.parametrizedRoute);
    }
  });
});
