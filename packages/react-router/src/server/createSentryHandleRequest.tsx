import type { createReadableStreamFromReadable } from '@react-router/node';
import type { ReactNode } from 'react';
import React from 'react';
import type { AppLoadContext, EntryContext, RouterContextProvider, ServerRouter } from 'react-router';
import { PassThrough } from 'stream';
import { getMetaTagTransformer } from './getMetaTagTransformer';
import { wrapSentryHandleRequest } from './wrapSentryHandleRequest';

type RenderToPipeableStreamOptions = {
  [key: string]: unknown;
  onShellReady?: () => void;
  onAllReady?: () => void;
  onShellError?: (error: unknown) => void;
  onError?: (error: unknown) => void;
};

type RenderToPipeableStreamResult = {
  pipe: (destination: NodeJS.WritableStream) => void;
  abort: () => void;
};

type RenderToPipeableStreamFunction = (
  node: ReactNode,
  options: RenderToPipeableStreamOptions,
) => RenderToPipeableStreamResult;

export interface SentryHandleRequestOptions {
  /**
   * Timeout in milliseconds after which the rendering stream will be aborted
   * @default 10000
   */
  streamTimeout?: number;

  /**
   * React's renderToPipeableStream function from 'react-dom/server'
   */
  renderToPipeableStream: RenderToPipeableStreamFunction;

  /**
   * The <ServerRouter /> component from '@react-router/server'
   */
  ServerRouter: typeof ServerRouter;

  /**
   * createReadableStreamFromReadable from '@react-router/node'
   */
  createReadableStreamFromReadable: typeof createReadableStreamFromReadable;

  /**
   * Regular expression to identify bot user agents
   * @default /bot|crawler|spider|googlebot|chrome-lighthouse|baidu|bing|google|yahoo|lighthouse/i
   */
  botRegex?: RegExp;
}

type HandleRequestWithoutMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) => Promise<unknown>;

type HandleRequestWithMiddleware = (
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) => Promise<unknown>;

/**
 * A complete Sentry-instrumented handleRequest implementation that handles both
 * route parametrization and trace meta tag injection.
 *
 * @param options Configuration options
 * @returns A Sentry-instrumented handleRequest function
 */
export function createSentryHandleRequest(
  options: SentryHandleRequestOptions,
): HandleRequestWithoutMiddleware & HandleRequestWithMiddleware {
  const {
    streamTimeout = 10000,
    renderToPipeableStream,
    ServerRouter,
    createReadableStreamFromReadable,
    botRegex = /bot|crawler|spider|googlebot|chrome-lighthouse|baidu|bing|google|yahoo|lighthouse/i,
  } = options;

  const handleRequest = function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    _loadContext: AppLoadContext | RouterContextProvider,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      let shellRendered = false;
      const userAgent = request.headers.get('user-agent');

      // Determine if we should use onAllReady or onShellReady
      const isBot = typeof userAgent === 'string' && botRegex.test(userAgent);
      const isSpaMode = !!(routerContext as { isSpaMode?: boolean }).isSpaMode;

      const readyOption = isBot || isSpaMode ? 'onAllReady' : 'onShellReady';

      const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} />, {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();

          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          // this injects trace data to the HTML head
          pipe(getMetaTagTransformer(body));
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          // eslint-disable-next-line no-param-reassign
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            // eslint-disable-next-line no-console
            console.error(error);
          }
        },
      });

      // Abort the rendering stream after the `streamTimeout`
      setTimeout(abort, streamTimeout);
    });
  };

  // Wrap the handle request function for request parametrization
  return wrapSentryHandleRequest(handleRequest as HandleRequestWithoutMiddleware) as HandleRequestWithoutMiddleware &
    HandleRequestWithMiddleware;
}
