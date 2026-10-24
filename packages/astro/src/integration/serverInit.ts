import type { VitePlugin } from './cloudflare';

export const SERVER_INIT_ID = 'virtual:sentry-astro/server-init';
export const SERVER_INIT_MIDDLEWARE_ID = 'virtual:sentry-astro/server-init-middleware';

const RESOLVED_ID_PREFIX = '\0';

export function sentryServerInitPlugin(serverInitCode: string): VitePlugin {
  return {
    name: 'sentry-astro-server-init',

    resolveId(id) {
      return id === SERVER_INIT_ID || id === SERVER_INIT_MIDDLEWARE_ID ? `${RESOLVED_ID_PREFIX}${id}` : undefined;
    },

    load(id) {
      if (id === `${RESOLVED_ID_PREFIX}${SERVER_INIT_ID}`) {
        return serverInitCode;
      }

      if (id === `${RESOLVED_ID_PREFIX}${SERVER_INIT_MIDDLEWARE_ID}`) {
        return `import "${SERVER_INIT_ID}";\nexport { onRequest } from '@sentry/astro/middleware';`;
      }

      return undefined;
    },
  };
}
