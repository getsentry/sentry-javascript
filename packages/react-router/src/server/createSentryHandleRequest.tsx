import type { createReadableStreamFromReadable } from '@react-router/node';
import type { ReactNode } from 'react';
import React from 'react';
import type { AppLoadContext, EntryContext, RouterContextProvider } from 'react-router';
import { PassThrough } from 'stream';
import { getMetaTagTransformer } from './getMetaTagTransformer';
import { createSentryHandleRequestWebStream } from './createSentryHandleRequestWebStream';
import type {
  HandleRequestWithMiddleware,
  HandleRequestWithoutMiddleware,
  SentryHandleRequestBaseOptions,
  SentryWebStreamHandleRequestOptions,
} from './handleRequestTypes';
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

export interface SentryHandleRequestOptions extends SentryHandleRequestBaseOptions {
  /**
   * React's renderToPipeableStream function from 'react-dom/server'
   */
  renderToPipeableStream: RenderToPipeableStreamFunction;

  /**
   * createReadableStreamFromReadable from '@react-router/node'
   */
  createReadableStreamFromReadable: typeof createReadableStreamFromReadable;
}

/**
 * A complete Sentry-instrumented handleRequest implementation that handles both
 * route parametrization and trace meta tag injection.
 *
 * Pass `renderToReadableStream` (Web Streams) instead of `renderToPipeableStream` to use the Web Streams variant.
 *
 * @param options Configuration options
 * @returns A Sentry-instrumented handleRequest function
 */
export function createSentryHandleRequest(
  options: SentryHandleRequestOptions,
): HandleRequestWithoutMiddleware & HandleRequestWithMiddleware;
export function createSentryHandleRequest(
  options: SentryWebStreamHandleRequestOptions,
): HandleRequestWithoutMiddleware & HandleRequestWithMiddleware;
export function createSentryHandleRequest(
  options: SentryHandleRequestOptions | SentryWebStreamHandleRequestOptions,
): HandleRequestWithoutMiddleware & HandleRequestWithMiddleware {
  if ('renderToReadableStream' in options) {
    return createSentryHandleRequestWebStream(options);
  }

  const {
    streamTimeout = 10000,
    renderToPipeableStream,
    ServerRouter,
    createReadableStreamFromReadable,
    botRegex = /bot|crawler|spider|googlebot|chrome-lighthouse|baidu|bing|google|yahoo|lighthouse/i,
    getNonce,
  } = options;

  const handleRequest = function handleRequest(
    request: Request,
    responseStatusCode: number,
    responseHeaders: Headers,
    routerContext: EntryContext,
    loadContext: AppLoadContext | RouterContextProvider,
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      let shellRendered = false;
      const userAgent = request.headers.get('user-agent');

      // Determine if we should use onAllReady or onShellReady
      const isBot = typeof userAgent === 'string' && botRegex.test(userAgent);
      const isSpaMode = !!(routerContext as { isSpaMode?: boolean }).isSpaMode;

      const readyOption = isBot || isSpaMode ? 'onAllReady' : 'onShellReady';
      const nonce = getNonce?.({ request, loadContext });
      const app = <ServerRouter context={routerContext} url={request.url} nonce={nonce} />;

      const { pipe, abort } = renderToPipeableStream(app, {
        nonce,
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
  return wrapSentryHandleRequest(handleRequest) as HandleRequestWithoutMiddleware & HandleRequestWithMiddleware;
}
