import type { ActionFunctionArgs, LoaderFunctionArgs, ServerBuild } from '@remix-run/node';
import type { AgnosticRouteObject } from '@remix-run/router';
import type { Span, TransactionSource } from '@sentry/core';
import { debug, GLOBAL_OBJ } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { getRequestMatch, matchServerRoutes } from './vendor/response';

type ServerRouteManifest = ServerBuild['routes'];

/**
 * Store configured FormData keys as span attributes for Remix actions.
 */
export async function storeFormDataKeys(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  span: Span,
  formDataKeys?: Record<string, string | boolean> | undefined,
): Promise<void> {
  try {
    // We clone the request for Remix be able to read the FormData later.
    const clonedRequest = args.request.clone();

    // This only will return the last name of multiple file uploads in a single FormData entry.
    // We can switch to `unstable_parseMultipartFormData` when it's stable.
    // https://remix.run/docs/en/main/utils/parse-multipart-form-data#unstable_parsemultipartformdata
    const formData = await clonedRequest.formData();

    formData.forEach((value, key) => {
      let attrKey = key;

      if (formDataKeys?.[key]) {
        if (typeof formDataKeys[key] === 'string') {
          attrKey = formDataKeys[key] as string;
        }

        span.setAttribute(
          `remix.action_form_data.${attrKey}`,
          typeof value === 'string' ? value : '[non-string value]',
        );
      }
    });
  } catch (e) {
    DEBUG_BUILD && debug.warn('Failed to read FormData from request', e);
  }
}

/**
 * Converts Remix route IDs to parameterized paths at runtime.
 * (e.g., "routes/users.$id" -> "/users/:id")
 *
 * @param routeId - The Remix route ID
 * @returns The parameterized path
 * @internal
 */
export function convertRemixRouteIdToPath(routeId: string): string {
  // Remove the "routes/" prefix if present
  const path = routeId.replace(/^routes\//, '');

  // Handle root index route
  if (path === 'index' || path === '_index') {
    return '/';
  }

  // Split by dots to get segments
  const segments = path.split('.');
  const pathSegments: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (!segment) {
      continue;
    }

    // Skip layout route segments (prefixed with _)
    if (segment.startsWith('_') && segment !== '_index') {
      continue;
    }

    // Handle 'index' segments at the end (they don't add to the path)
    if (segment === 'index' && i === segments.length - 1 && pathSegments.length > 0) {
      continue;
    }

    // Handle splat routes (catch-all)
    // Remix accesses splat params via params["*"] at runtime
    if (segment === '$') {
      pathSegments.push(':*');
      continue;
    }

    // Handle dynamic segments (prefixed with $)
    if (segment.startsWith('$')) {
      const paramName = segment.substring(1);
      pathSegments.push(`:${paramName}`);
    } else if (segment !== 'index') {
      // Static segment (skip remaining 'index' segments)
      pathSegments.push(segment);
    }
  }

  // Return with leading slash for consistency with client-side URL paths
  const routePath = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
  return routePath;
}

/**
 * Check if the Vite plugin manifest is available.
 * @returns True if the manifest is available, false otherwise.
 */
function hasManifest(): boolean {
  const globalWithInjectedManifest = GLOBAL_OBJ as typeof GLOBAL_OBJ & {
    _sentryRemixRouteManifest: string | undefined;
  };

  return (
    !!globalWithInjectedManifest?._sentryRemixRouteManifest &&
    typeof globalWithInjectedManifest._sentryRemixRouteManifest === 'string'
  );
}

/**
 * Get transaction name from routes and url
 */
export function getTransactionName(routes: AgnosticRouteObject[], url: URL): [string, TransactionSource] {
  const matches = matchServerRoutes(routes, url.pathname);
  const match = matches && getRequestMatch(url, matches);

  if (match === null) {
    return [url.pathname, 'url'];
  }

  const routeId = match.route.id || 'no-route-id';

  // Only use parameterized path if the Vite plugin manifest is available
  // This ensures backward compatibility - without the plugin, we use the old behavior
  if (hasManifest()) {
    const parameterizedPath = convertRemixRouteIdToPath(routeId);
    return [parameterizedPath, 'route'];
  }

  // Fallback to old behavior (route ID) when manifest is not available
  return [routeId, 'route'];
}

/**
 * Creates routes from the server route manifest
 *
 * @param manifest
 * @param parentId
 */
export function createRoutes(manifest: ServerRouteManifest, parentId?: string): AgnosticRouteObject[] {
  return Object.entries(manifest)
    .filter(([, route]) => route.parentId === parentId)
    .map(([id, route]) => ({
      ...route,
      children: createRoutes(manifest, id),
    })) as AgnosticRouteObject[];
}
