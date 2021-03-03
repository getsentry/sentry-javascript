import { captureException, flush, Handlers, withScope } from '@sentry/nextjs';
import getConfig from 'next/config';

const { parseRequest } = Handlers;

export default async function onErrorServer(err) {
  const { serverRuntimeConfig = {}, publicRuntimeConfig = {} } = getConfig() || {};
  const sentryTimeout = serverRuntimeConfig.sentryTimeout || publicRuntimeConfig.sentryTimeout || 2000;

  withScope(scope => {
    if (typeof err.req !== 'undefined') {
      scope.addEventProcessor(event =>
        parseRequest(event, err.req, {
          // 'cookies' and 'query_string' use `dynamicRequire` which has a bug in SSR envs right now — Kamil
          request: ['data', 'headers', 'method', 'url'],
        }),
      );
    }
    captureException(err instanceof Error ? err : err.err);
  });

  await flush(sentryTimeout);
}
