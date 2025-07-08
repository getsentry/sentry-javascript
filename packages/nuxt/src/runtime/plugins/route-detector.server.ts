import { getActiveSpan, getRootSpan, logger, SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, updateSpanName } from '@sentry/core';
import { defineNuxtPlugin } from 'nuxt/app';
import type { NuxtPage } from 'nuxt/schema';
import { extractParametrizedRouteFromContext } from '../utils/route-extraction';

export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.hooks.hook('app:rendered', async renderContext => {
    let buildTimePagesData: NuxtPage[] = [];
    try {
      // This is a common Nuxt pattern to import build-time generated data: https://nuxt.com/docs/4.x/api/kit/templates#creating-a-virtual-file-for-runtime-plugin
      // @ts-expect-error This import is dynamically resolved at build time (`addTemplate` in module.ts)
      const { default: importedPagesData } = await import('#build/sentry--nuxt-pages-data.mjs');
      buildTimePagesData = importedPagesData || [];
    } catch (error) {
      buildTimePagesData = [];
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

      if (rootSpan) {
        const method = ssrContext?.event?._method || 'GET';
        const parametrizedTransactionName = `${method.toUpperCase()} ${routeInfo.parametrizedRoute}`;

        logger.log('Updating root span name to:', parametrizedTransactionName);
        updateSpanName(rootSpan, parametrizedTransactionName);

        rootSpan.setAttributes({
          [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
          'http.route': routeInfo.parametrizedRoute,
        });
      }
    }
  });
});
