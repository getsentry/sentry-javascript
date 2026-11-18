import { consoleSandbox } from '@sentry/core';
import { _INTERNAL_getReleaseMetaTag as getReleaseMetaTag } from '@sentry/core/server';
import { injectIntoHead } from './headTagInjector';

type HandleDocumentRequest = (...args: unknown[]) => unknown;

type ServerBuildEntry = { module: { default?: unknown } };

/**
 * Wraps the server build's document request handler, so every HTML document it renders carries the release in a
 * meta tag. The Vite plugin calls this from the server build, after it turned off the bundler plugin's release
 * injection, so the release stays out of the content-hashed client chunks.
 *
 * Any `handleRequest` gets the tag, including the default one and one that does not use the SDK's helpers. SPA mode
 * and prerendering render their HTML through the same handler at build time.
 */
export function injectClientRelease(entry: ServerBuildEntry | undefined, release: string): void {
  const handleRequest = entry?.module?.default;
  if (!entry || typeof handleRequest !== 'function') {
    // The client build left the release out, so without the tag browser events have no release.
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Sentry] Could not find the request handler in the React Router server build, so browser events will not have a release. Pass `release` to `Sentry.init` in `entry.client`.',
      );
    });
    return;
  }

  const tag = getReleaseMetaTag(release);

  async function sentryHandleRequestWithRelease(this: unknown, ...args: unknown[]): Promise<unknown> {
    const response = await (handleRequest as HandleDocumentRequest).apply(this, args);
    return addTagToDocument(response, tag);
  }

  entry.module = { ...entry.module, default: sentryHandleRequestWithRelease };
}

function addTagToDocument(response: unknown, tag: string): unknown {
  if (!(response instanceof Response) || !response.body || response.headers.has('content-encoding')) {
    return response;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('text/html')) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');

  return new Response(injectIntoHead(response.body, tag), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
