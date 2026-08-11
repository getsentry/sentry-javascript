import type { ActionFunctionArgs, LoaderFunctionArgs, ServerBuild } from '@remix-run/node';
import type { AgnosticRouteObject } from '@remix-run/router';
import type { Span, TransactionSource } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import type { FormDataCapture } from './formData';
import { applyFormDataAttributes } from './formData';
import { matchServerRoutes } from './vendor/response';

type ServerRouteManifest = ServerBuild['routes'];

/**
 * Store configured FormData keys as span attributes for Remix actions.
 */
export async function storeFormDataKeys(
  args: LoaderFunctionArgs | ActionFunctionArgs,
  span: Span,
  formDataCapture: FormDataCapture,
): Promise<void> {
  try {
    // We clone the request for Remix be able to read the FormData later.
    const clonedRequest = args.request.clone();

    // This only will return the last name of multiple file uploads in a single FormData entry.
    // We can switch to `unstable_parseMultipartFormData` when it's stable.
    // https://remix.run/docs/en/main/utils/parse-multipart-form-data#unstable_parsemultipartformdata
    const formData = await clonedRequest.formData();

    applyFormDataAttributes(span, formData, formDataCapture);
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
  if (path === '_index') {
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

    // Handle '_index' segments at the end (always skip - indicates an index route)
    if (segment === '_index' && i === segments.length - 1) {
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
    } else {
      pathSegments.push(segment);
    }
  }

  // Return with leading slash for consistency with client-side URL paths
  const routePath = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
  return routePath;
}

/** Check if running in Cloudflare Workers environment. */
export function isCloudflareEnv(): boolean {
  // eslint-disable-next-line no-restricted-globals
  return typeof navigator !== 'undefined' && navigator?.userAgent?.includes('Cloudflare');
}

/**
 * Get transaction name from routes and url
 */
export function getTransactionName(routes: AgnosticRouteObject[], url: URL): [string, TransactionSource] {
  const matches = matchServerRoutes(routes, url.pathname);
  const match = matches?.[matches.length - 1];

  if (!match) {
    return [url.pathname, 'url'];
  }

  const routeId = match.route.id || 'no-route-id';

  // Convert route ID to parameterized path (e.g., "routes/users.$id" -> "/users/:id")
  // This is a pure string transformation that works without the Vite plugin manifest
  const parameterizedPath = convertRemixRouteIdToPath(routeId);
  return [parameterizedPath, 'route'];
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
