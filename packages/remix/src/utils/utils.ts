import type { ActionFunctionArgs, LoaderFunctionArgs, ServerBuild } from '@remix-run/node';
import type { AgnosticRouteObject } from '@remix-run/router';
import type { Span, TransactionSource } from '@sentry/core';
import { debug } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { getRequestMatch, matchServerRoutes } from './vendor/response';

type ServerRouteManifest = ServerBuild['routes'];

/**
 *
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
          attrKey = formDataKeys[key];
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
 * Get transaction name from routes and url
 */
export function getTransactionName(routes: AgnosticRouteObject[], url: URL): [string, TransactionSource] {
  const matches = matchServerRoutes(routes, url.pathname);
  const match = matches && getRequestMatch(url, matches);
  return match === null ? [url.pathname, 'url'] : [match.route.id || 'no-route-id', 'route'];
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
