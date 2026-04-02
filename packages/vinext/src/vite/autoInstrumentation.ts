import * as path from 'path';
import type { Plugin } from 'vite';
import type { AutoInstrumentOptions } from './types';

const WRAPPED_MODULE_SUFFIX = '?sentry-auto-wrap';

/**
 * Creates a Vite plugin that automatically instruments vinext application code.
 * Wraps App Router server components, route handlers, middleware, and Pages Router API routes.
 */
export function makeAutoInstrumentationPlugin(options: boolean | AutoInstrumentOptions): Plugin {
  const resolvedOptions: Required<AutoInstrumentOptions> = {
    serverComponents: true,
    routeHandlers: true,
    middleware: true,
    apiRoutes: true,
    ...(typeof options === 'object' ? options : {}),
  };

  return {
    name: 'sentry-vinext-auto-instrumentation',
    enforce: 'pre',

    load(id) {
      const filename = path.basename(id);
      const normalizedId = id.replace(/\\/g, '/');

      // Skip already-wrapped modules to avoid infinite recursion
      if (id.includes(WRAPPED_MODULE_SUFFIX)) {
        return null;
      }

      // App Router route handlers: app/**/route.(ts|js|tsx|jsx)
      if (resolvedOptions.routeHandlers && isRouteHandler(normalizedId, filename)) {
        const parameterizedRoute = extractAppRouterRoute(normalizedId);
        return getRouteHandlerWrapperCode(id, parameterizedRoute);
      }

      // App Router server components: app/**/page.(ts|js|tsx|jsx) and app/**/layout.(ts|js|tsx|jsx)
      if (resolvedOptions.serverComponents && isServerComponent(normalizedId, filename)) {
        const parameterizedRoute = extractAppRouterRoute(normalizedId);
        const componentType = filename.startsWith('page') ? 'page' : 'layout';
        return getServerComponentWrapperCode(id, parameterizedRoute, componentType);
      }

      // Middleware: middleware.(ts|js)
      if (resolvedOptions.middleware && isMiddleware(normalizedId, filename)) {
        return getMiddlewareWrapperCode(id);
      }

      // Pages Router API routes: pages/api/**
      if (resolvedOptions.apiRoutes && isApiRoute(normalizedId, filename)) {
        const parameterizedRoute = extractPagesRouterRoute(normalizedId);
        return getApiRouteWrapperCode(id, parameterizedRoute);
      }

      return null;
    },
  };
}

function isRouteHandler(normalizedId: string, filename: string): boolean {
  return /\/app\//.test(normalizedId) && /^route\.(ts|js|tsx|jsx|mts|mjs)$/.test(filename);
}

function isServerComponent(normalizedId: string, filename: string): boolean {
  return /\/app\//.test(normalizedId) && /^(page|layout)\.(ts|js|tsx|jsx|mts|mjs)$/.test(filename);
}

function isMiddleware(normalizedId: string, filename: string): boolean {
  return (
    /^middleware\.(ts|js|mts|mjs)$/.test(filename) &&
    // Ensure it's at the project root or src/ level, not nested in app/
    !normalizedId.includes('/app/') &&
    !normalizedId.includes('/pages/')
  );
}

function isApiRoute(normalizedId: string, filename: string): boolean {
  return /\/pages\/api\//.test(normalizedId) && /\.(ts|js|tsx|jsx|mts|mjs)$/.test(filename);
}

/**
 * Extracts a parameterized route from an App Router file path.
 * e.g. `/path/to/app/blog/[slug]/page.tsx` -> `/blog/[slug]`
 */
function extractAppRouterRoute(normalizedId: string): string {
  const appMatch = normalizedId.match(/\/app(\/.*?)\/(page|layout|route)\.\w+$/);
  if (appMatch) {
    return appMatch[1] || '/';
  }
  // Root level: app/page.tsx -> /
  if (/\/app\/(page|layout|route)\.\w+$/.test(normalizedId)) {
    return '/';
  }
  return '/';
}

/**
 * Extracts a parameterized route from a Pages Router file path.
 * e.g. `/path/to/pages/api/users/[id].ts` -> `/api/users/[id]`
 */
function extractPagesRouterRoute(normalizedId: string): string {
  const pagesMatch = normalizedId.match(/\/pages(\/.*?)\.\w+$/);
  if (pagesMatch) {
    // Remove /index suffix since /pages/api/index.ts -> /api
    return pagesMatch[1]?.replace(/\/index$/, '') || '/';
  }
  return '/';
}

function getRouteHandlerWrapperCode(id: string, route: string): string {
  const wrappedId = `${id}${WRAPPED_MODULE_SUFFIX}`;
  return [
    'import { wrapRouteHandlerWithSentry as _sentry_wrapRouteHandler } from "@sentry/vinext";',
    `import * as _sentry_routeModule from ${JSON.stringify(wrappedId)};`,
    `const _sentry_route = ${JSON.stringify(route)};`,
    'export const GET = _sentry_routeModule.GET ? _sentry_wrapRouteHandler(_sentry_routeModule.GET, "GET", _sentry_route) : undefined;',
    'export const POST = _sentry_routeModule.POST ? _sentry_wrapRouteHandler(_sentry_routeModule.POST, "POST", _sentry_route) : undefined;',
    'export const PUT = _sentry_routeModule.PUT ? _sentry_wrapRouteHandler(_sentry_routeModule.PUT, "PUT", _sentry_route) : undefined;',
    'export const PATCH = _sentry_routeModule.PATCH ? _sentry_wrapRouteHandler(_sentry_routeModule.PATCH, "PATCH", _sentry_route) : undefined;',
    'export const DELETE = _sentry_routeModule.DELETE ? _sentry_wrapRouteHandler(_sentry_routeModule.DELETE, "DELETE", _sentry_route) : undefined;',
    'export const HEAD = _sentry_routeModule.HEAD ? _sentry_wrapRouteHandler(_sentry_routeModule.HEAD, "HEAD", _sentry_route) : undefined;',
    'export const OPTIONS = _sentry_routeModule.OPTIONS ? _sentry_wrapRouteHandler(_sentry_routeModule.OPTIONS, "OPTIONS", _sentry_route) : undefined;',
  ].join('\n');
}

function getServerComponentWrapperCode(id: string, route: string, componentType: string): string {
  const wrappedId = `${id}${WRAPPED_MODULE_SUFFIX}`;
  return [
    'import { wrapServerComponentWithSentry as _sentry_wrapServerComponent } from "@sentry/vinext";',
    `import * as _sentry_componentModule from ${JSON.stringify(wrappedId)};`,
    `export default _sentry_componentModule.default ? _sentry_wrapServerComponent(_sentry_componentModule.default, { componentRoute: ${JSON.stringify(route)}, componentType: ${JSON.stringify(componentType)} }) : undefined;`,
    `export * from ${JSON.stringify(wrappedId)};`,
  ].join('\n');
}

function getMiddlewareWrapperCode(id: string): string {
  const wrappedId = `${id}${WRAPPED_MODULE_SUFFIX}`;
  return [
    'import { wrapMiddlewareWithSentry as _sentry_wrapMiddleware } from "@sentry/vinext";',
    `import * as _sentry_middlewareModule from ${JSON.stringify(wrappedId)};`,
    'export default _sentry_middlewareModule.default ? _sentry_wrapMiddleware(_sentry_middlewareModule.default) : undefined;',
    'export const config = _sentry_middlewareModule.config;',
  ].join('\n');
}

function getApiRouteWrapperCode(id: string, route: string): string {
  const wrappedId = `${id}${WRAPPED_MODULE_SUFFIX}`;
  return [
    'import { wrapApiHandlerWithSentry as _sentry_wrapApiHandler } from "@sentry/vinext";',
    `import * as _sentry_apiModule from ${JSON.stringify(wrappedId)};`,
    `export default _sentry_apiModule.default ? _sentry_wrapApiHandler(_sentry_apiModule.default, ${JSON.stringify(route)}) : _sentry_apiModule.default;`,
    `export * from ${JSON.stringify(wrappedId)};`,
  ].join('\n');
}
