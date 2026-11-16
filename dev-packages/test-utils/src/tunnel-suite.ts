import { expect, test } from '@playwright/test';
import { HTTP_CLIENT } from '@sentry/conventions/op';
import type { Event, SerializedStreamedSpan } from '@sentry/core';
import { connect } from 'node:net';
import { getSpanOp, waitForError, waitForRequest } from './event-proxy-server';
import { isServerSpanAt, makeClientReportEnvelope, watchForTunnelSpan } from './tunnel';

/** The port `getPlaywrightConfig` serves the app on by default. */
const APP_PORT = 3030;

/** The DSN a tunnel test app sends to, which forwards to its event proxy. */
const TUNNEL_TEST_DSN = 'http://public@localhost:3031/1337';

/** The path the SDK derives from `TUNNEL_TEST_DSN`. */
const DSN_TUNNEL_PATH = '/qpo967';

/** The message of the error that `{basePath}/api/error` throws. */
const TUNNEL_TEST_ERROR_MESSAGE = 'Tunnel test error';

export interface ManagedTunnelSuiteOptions {
  /** The `proxyServerName` of the app's event proxy. */
  appName: string;
  /** The base path the app and its managed tunnel are served under, like `/app`. */
  basePath: string;
  /** Also counts the spans this matches as spans of the tunnel request, for framework spans without `url.path`. */
  isTunnelSpan?: (span: SerializedStreamedSpan, tunnelPath: string) => boolean;
  /** The path the managed tunnel is served at, if it's a fixed one. Defaults to the DSN-derived path under `basePath`. */
  tunnelPath?: string;
  /** Whether the app's routes, and so its tunnel path, end in a `/`. */
  trailingSlash?: boolean;
}

/**
 * Tests the managed tunnel of an app that serves it under a base path. The app has:
 * - `serveTunnelIntegration()` on the server and `tunnel: true` (or the base path) in the browser, both with
 *   `TUNNEL_TEST_DSN`
 * - a page at `{basePath}/` that loads the browser SDK
 * - `GET {basePath}/api/anchor`, answered with a 200
 * - `GET {basePath}/api/error`, which throws `TUNNEL_TEST_ERROR_MESSAGE`
 * - a middleware that answers every POST with a 401
 */
export function runManagedTunnelSuite({
  appName,
  basePath,
  isTunnelSpan,
  tunnelPath: fixedTunnelPath,
  trailingSlash = false,
}: ManagedTunnelSuiteOptions): void {
  const appPath = (path: string): string => `${basePath}${path}${trailingSlash ? '/' : ''}`;
  const tunnelPath = fixedTunnelPath ?? appPath(DSN_TUNNEL_PATH);
  const anchorPath = appPath('/api/anchor');
  const isTunnelRequest = (method: string, url: string): boolean =>
    method === 'POST' && new URL(url).pathname === tunnelPath;

  test('answers the browser under the base path before the app middleware, without spans of it', async ({ page }) => {
    expect((await page.request.post(anchorPath, { data: 'x' })).status()).toBe(401);

    const raceTunnelSpan = watchForTunnelSpan(
      appName,
      span => isServerSpanAt(tunnelPath)(span) || isIngestRequestSpan(span) || !!isTunnelSpan?.(span, tunnelPath),
    );
    const tunnelResponsePromise = page.waitForResponse(response =>
      isTunnelRequest(response.request().method(), response.url()),
    );

    await page.goto(`${basePath}/`);

    expect((await tunnelResponsePromise).status()).toBe(200);
    expect(await raceTunnelSpan(isServerSpanAt(anchorPath), () => page.request.get(anchorPath))).toBe('anchor');
  });

  test('forwards browser events without the cookies of the browser', async ({ page, context, baseURL }) => {
    const message = 'Tunnel cookie test';
    await context.addCookies([{ name: 'session', value: '8f2c1d', url: baseURL }]);
    const proxyRequestPromise = waitForRequest(appName, ({ envelope }) =>
      envelope[1].some(
        ([itemHeader, item]) =>
          itemHeader.type === 'event' && (item as Event).exception?.values?.[0]?.value === message,
      ),
    );

    await page.goto(`${basePath}/`);
    await page.waitForFunction(() => typeof (globalThis as { __SENTRY__?: unknown }).__SENTRY__ === 'object');
    const tunnelRequestPromise = page.waitForRequest(
      request => isTunnelRequest(request.method(), request.url()) && !!request.postData()?.includes(message),
    );
    await page.evaluate(message => {
      setTimeout(() => {
        throw new Error(message);
      });
    }, message);

    expect((await (await tunnelRequestPromise).allHeaders()).cookie).toBe('session=8f2c1d');
    const { rawProxyRequestHeaders } = await proxyRequestPromise;
    expect(rawProxyRequestHeaders.cookie).toBeUndefined();
    expect(rawProxyRequestHeaders['content-type']).toBe('application/x-sentry-envelope');
  });

  test('answers tunnel requests without errors, also when the client drops the connection', async ({ request }) => {
    const firstErrorPromise = waitForError(appName, () => true);

    const response = await request.post(tunnelPath, {
      data: makeClientReportEnvelope(TUNNEL_TEST_DSN),
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
    });
    expect(response.status()).toBe(200);

    // Part of the envelope header line, without its newline, then the connection drops.
    await new Promise<void>(resolve => {
      const socket = connect(APP_PORT, 'localhost', () => {
        socket.write(
          `POST ${tunnelPath} HTTP/1.1\r\nHost: localhost:${APP_PORT}\r\nContent-Type: application/x-sentry-envelope\r\nContent-Length: 1000000\r\n\r\n`,
        );
        socket.write(JSON.stringify({ dsn: TUNNEL_TEST_DSN, padding: 'x'.repeat(1000) }).slice(0, 500));
        setTimeout(() => {
          socket.destroy();
          resolve();
        }, 300);
      });
    });

    // Errors are sent in order, so one from a tunnel request would arrive before this one.
    await request.get(appPath('/api/error'));

    expect((await firstErrorPromise).exception?.values?.[0]?.value).toBe(TUNNEL_TEST_ERROR_MESSAGE);
  });
}

function isIngestRequestSpan(span: SerializedStreamedSpan): boolean {
  const url = span.attributes['url.full']?.value;
  return getSpanOp(span) === HTTP_CLIENT && typeof url === 'string' && url.startsWith('http://localhost:3031/');
}
