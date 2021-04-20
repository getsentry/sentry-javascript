import { captureException, flush, Handlers, withScope } from '@sentry/nextjs';
import getConfig from 'next/config';

const { parseRequest } = Handlers;

export default async function onErrorServer(err) {
  const { serverRuntimeConfig = {}, publicRuntimeConfig = {} } = getConfig() || {};
  const sentryTimeout = serverRuntimeConfig.sentryTimeout || publicRuntimeConfig.sentryTimeout || 2000;

  withScope(scope => {
    if (err.req) {
      scope.addEventProcessor(event => {
        return parseRequest(event, err.req, {
          // 'cookies' and 'query_string' use `dynamicRequire` which has a bug in SSR envs right now — Kamil
          request: ['data', 'headers', 'method', 'url'],
        });
      });
    }

    const toCapture = err instanceof Error ? err : err.err;

    scope.addEventProcessor((event, hint) => {
      if (hint.originalException === toCapture) {
        event.exception.values[0].mechanism = {
          handled: false,
          type: 'onErrorServer',
        };
      }
      return event;
    });

    captureException(toCapture);
  });

  await flush(sentryTimeout);
}
