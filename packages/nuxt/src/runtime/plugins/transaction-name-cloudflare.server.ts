import { getIsolationScope, stripUrlQueryAndFragment } from '@sentry/core';
import type { H3Event } from 'h3';
import type { NitroAppPlugin } from 'nitropack';

export default (nitroApp => {
  // `withSentry` sets no transaction name, so errors captured during the request would have none.
  // This is the same best-effort name the Node SDK sets when a request starts.
  nitroApp.hooks.hook('request', (event: H3Event) => {
    getIsolationScope().setTransactionName(`${event.method} ${stripUrlQueryAndFragment(event.path)}`);
  });
}) satisfies NitroAppPlugin;
