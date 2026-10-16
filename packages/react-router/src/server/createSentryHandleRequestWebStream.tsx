import { _INTERNAL_safeUnref } from '@sentry/core/server';
import React from 'react';
import type { AppLoadContext, EntryContext, RouterContextProvider } from 'react-router';
import type {
  HandleRequestWithMiddleware,
  HandleRequestWithoutMiddleware,
  RenderToReadableStreamResult,
  SentryWebStreamHandleRequestOptions,
} from './handleRequestTypes';
import { injectTraceMetaTags } from './injectTraceMetaTags';
import { wrapSentryHandleRequest } from './wrapSentryHandleRequest';

/**
 * Web Streams variant of `createSentryHandleRequest`, for runtimes without Node streams (e.g. Cloudflare Workers).
 * Must not import any Node.js modules.
 */
export function createSentryHandleRequestWebStream(
  options: SentryWebStreamHandleRequestOptions,
): HandleRequestWithoutMiddleware & HandleRequestWithMiddleware {
  const {
    streamTimeout = 10000,
    renderToReadableStream,
    ServerRouter,
    botRegex = /bot|crawler|spider|googlebot|chrome-lighthouse|baidu|bing|google|yahoo|lighthouse/i,
    getNonce,
  } = options;

  const handleRequest = async function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext | RouterContextProvider,
  ): Promise<Response> {
    let statusCode = responseStatusCode;
    let shellRendered = false;
    const userAgent = request.headers.get('user-agent');
    const isBot = typeof userAgent === 'string' && botRegex.test(userAgent);
    const isSpaMode = !!(routerContext as { isSpaMode?: boolean }).isSpaMode;

    const nonce = getNonce?.({ request, loadContext });
    const app = <ServerRouter context={routerContext} url={request.url} nonce={nonce} />;

    const controller = new AbortController();
    const abortTimer = _INTERNAL_safeUnref(setTimeout(() => controller.abort(), streamTimeout));
    const abortRender = (): void => controller.abort(request.signal.reason);
    if (request.signal.aborted) {
      abortRender();
    } else {
      request.signal.addEventListener('abort', abortRender, { once: true });
    }
    const stopAbortHandling = (): void => {
      clearTimeout(abortTimer);
      request.signal.removeEventListener('abort', abortRender);
    };

    let body: RenderToReadableStreamResult;
    try {
      body = await renderToReadableStream(app, {
        nonce,
        signal: controller.signal,
        onError(error: unknown) {
          statusCode = 500;
          // Shell errors reject the render promise and get logged by the caller.
          if (shellRendered) {
            // eslint-disable-next-line no-console
            console.error(error);
          }
        },
      });
    } catch (error) {
      stopAbortHandling();
      throw error;
    }

    shellRendered = true;
    body.allReady.then(stopAbortHandling, stopAbortHandling);

    if (isBot || isSpaMode) {
      await body.allReady;
    }

    responseHeaders.set('Content-Type', 'text/html');

    return new Response(injectTraceMetaTags(body), {
      headers: responseHeaders,
      status: statusCode,
    });
  };

  return wrapSentryHandleRequest(handleRequest) as HandleRequestWithoutMiddleware & HandleRequestWithMiddleware;
}
