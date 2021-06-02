import { captureException, flush, getCurrentHub, Handlers, startTransaction, withScope } from '@sentry/node';
import { extractTraceparentData, getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import { addExceptionMechanism, isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';
import { NextApiHandler } from 'next';

import { addRequestDataToEvent, NextRequest } from './instrumentServer';

const { parseRequest } = Handlers;

// purely for clarity
type WrappedNextApiHandler = NextApiHandler;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: NextApiHandler): WrappedNextApiHandler => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req, res) => {
    try {
      const currentScope = getCurrentHub().getScope();

      if (currentScope) {
        currentScope.addEventProcessor(event => addRequestDataToEvent(event, req as NextRequest));

        // We only want to record page and API requests
        if (hasTracingEnabled()) {
          // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
          let traceparentData;
          if (req.headers && isString(req.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(req.headers['sentry-trace'] as string);
            logger.log(`[Tracing] Continuing trace ${traceparentData?.traceId}.`);
          }

          const url = `${req.url}`;
          // pull off query string, if any
          let reqPath = stripUrlQueryAndFragment(url);
          // Replace with placeholder
          if (req.query) {
            for (const [key, value] of Object.entries(req.query)) {
              reqPath = reqPath.replace(`${value}`, `[${key}]`);
            }
          }

          // requests for pages will only ever be GET requests, so don't bother to include the method in the transaction
          // name; requests to API routes could be GET, POST, PUT, etc, so do include it there
          const namePrefix = `${(req.method || 'GET').toUpperCase()} `;

          const transaction = startTransaction(
            {
              name: `${namePrefix}${reqPath}`,
              op: 'http.server',
              metadata: { requestPath: reqPath },
              ...traceparentData,
            },
            // extra context passed to the `tracesSampler`
            { request: req },
          );
          currentScope.setSpan(transaction);
        }
      }

      return await handler(req, res); // Call Handler
    } catch (e) {
      withScope(scope => {
        scope.addEventProcessor(event => {
          addExceptionMechanism(event, {
            handled: false,
          });
          return parseRequest(event, req);
        });
        captureException(e);
      });
      throw e;
    } finally {
      const transaction = getActiveTransaction();
      if (transaction) {
        transaction.setHttpStatus(res.statusCode);

        // we'll collect this data in a more targeted way in the event processor we added above,
        // `addRequestDataToEvent`
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        delete transaction.metadata.requestPath;

        transaction.finish();
      }
      try {
        await flush(2000);
      } catch (e) {
        // no-empty
      }
    }
  };
};
