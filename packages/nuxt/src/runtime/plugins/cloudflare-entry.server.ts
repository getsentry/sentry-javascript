import { getIsolationScope, stripUrlQueryAndFragment } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroAppPlugin } from 'nitropack';
import { markCloudflareEntryWrapped } from '../utils/cloudflare-entry';

type H3V2Event = { req: { method: string }; url: { pathname: string } };

export default (nitroApp => {
  // This plugin runs before the plugins of the app, so a `sentryCloudflareNitroPlugin` there sees the flag.
  markCloudflareEntryWrapped();

  // `withSentry` sets no transaction name, so errors captured during the request would have none.
  // This is the same best-effort name the Node SDK sets when a request starts.
  nitroApp.hooks.hook('request', (event: H3Event) => {
    // h3 v1 (Nitro 2) has the method and the path on the event, h3 v2 (Nitro 3) on `event.req` and `event.url`.
    const { req, url } = event as unknown as Partial<H3V2Event>;
    const method = event.method ?? req?.method;
    const path = event.path ?? url?.pathname;
    getIsolationScope().setTransactionName(`${method} ${stripUrlQueryAndFragment(path)}`);
  });
}) satisfies NitroAppPlugin;
