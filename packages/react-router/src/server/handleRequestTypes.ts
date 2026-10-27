import type { ReactNode } from 'react';
import type { AppLoadContext, EntryContext, RouterContextProvider, ServerRouter } from 'react-router';

type RenderToReadableStreamOptions = {
  [key: string]: unknown;
  nonce?: string;
  signal?: AbortSignal;
  onError?: (error: unknown) => void;
};

export type RenderToReadableStreamResult = ReadableStream & { allReady: Promise<void> };

type RenderToReadableStreamFunction = (
  node: ReactNode,
  options: RenderToReadableStreamOptions,
) => Promise<RenderToReadableStreamResult>;

export interface SentryHandleRequestBaseOptions {
  /**
   * Timeout in milliseconds after which the rendering stream will be aborted
   * @default 10000
   */
  streamTimeout?: number;

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
   * The nonce is passed to both `<ServerRouter />` and the render function.
   */
  getNonce?: (args: { request: Request; loadContext: AppLoadContext | RouterContextProvider }) => string | undefined;
}

export interface SentryWebStreamHandleRequestOptions extends SentryHandleRequestBaseOptions {
  /**
   * React's renderToReadableStream function from 'react-dom/server'
   */
  renderToReadableStream: RenderToReadableStreamFunction;
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
