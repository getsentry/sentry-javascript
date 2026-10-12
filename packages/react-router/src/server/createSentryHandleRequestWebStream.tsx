import type { ReactNode } from 'react';
import React from 'react';
import type { AppLoadContext, EntryContext, RouterContextProvider, ServerRouter } from 'react-router';
import { injectTraceMetaTags } from './injectTraceMetaTags';
import { wrapSentryHandleRequest } from './wrapSentryHandleRequest';

type RenderToReadableStreamOptions = {
  [key: string]: unknown;
  nonce?: string;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
};

type RenderToReadableStreamResult = ReadableStream & { allReady: Promise<void> };

type RenderToReadableStreamFunction = (
  node: ReactNode,
  options: RenderToReadableStreamOptions,
) => Promise<RenderToReadableStreamResult>;

export interface SentryWebStreamHandleRequestOptions {
  /**
   * Timeout in milliseconds after which the rendering stream will be aborted
   * @default 10000
   */
  streamTimeout?: number;

  /**
   * React's renderToReadableStream function from 'react-dom/server'
   */
  renderToReadableStream: RenderToReadableStreamFunction;

  /**
   * The <ServerRouter /> component from '@react-router/server'
   */
  ServerRouter: typeof ServerRouter;

  /**
   * Regular expression to identify bot user agents
   * @default /bot|crawler|spider|googlebot|chrome-lighthouse|baidu|bing|google|yahoo|lighthouse/i
   */
  botRegex?: RegExp;

  /**
   * Returns a Content Security Policy nonce for the current request.
   * The nonce is passed to both `<ServerRouter />` and `renderToReadableStream`.
   */
  getNonce?: (args: { request: Request; loadContext: AppLoadContext | RouterContextProvider }) => string | undefined;
}

export type HandleRequestWithoutMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) => Promise<unknown>;

export type HandleRequestWithMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) => Promise<unknown>;

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
    const abortTimer = setTimeout(() => controller.abort(), streamTimeout);

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
      clearTimeout(abortTimer);
      throw error;
    }

    shellRendered = true;
    const clearAbortTimer = (): void => clearTimeout(abortTimer);
    body.allReady.then(clearAbortTimer, clearAbortTimer);

    if (isBot || isSpaMode) {
      await body.allReady.catch(() => undefined);
    }

    responseHeaders.set('Content-Type', 'text/html');

    return new Response(injectTraceMetaTags(body), {
      headers: responseHeaders,
      status: statusCode,
    });
  };

  return wrapSentryHandleRequest(handleRequest) as HandleRequestWithoutMiddleware & HandleRequestWithMiddleware;
}
