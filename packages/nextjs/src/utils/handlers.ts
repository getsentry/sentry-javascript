import { captureException, flush, getCurrentHub, Handlers, startTransaction, withScope } from '@sentry/node';
import { extractTraceparentData, getActiveTransaction, hasTracingEnabled } from '@sentry/tracing';
import { addExceptionMechanism, isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';
import * as domain from 'domain';
import { NextApiHandler, NextApiResponse } from 'next';

import { addRequestDataToEvent, NextRequest } from './instrumentServer';

const { parseRequest } = Handlers;

// purely for clarity
type WrappedNextApiHandler = NextApiHandler;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (handler: NextApiHandler): WrappedNextApiHandler => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req, res) => {
    const origEnd = res.end;

    async function newEnd(this: NextApiResponse, ...args: any[]) {
      const transaction = getActiveTransaction();

      if (transaction) {
        transaction.setHttpStatus(res.statusCode);

        transaction.finish();
      }
      try {
        logger.log('Flushing events...');
        await flush(2000);
      } catch (e) {
        logger.log(`Error while flushing events:\n${e}`);
      } finally {
        logger.log('Done flushing events');
        // res.end();
      }

      return origEnd.call(this, ...args);
    }

    res.end = newEnd;

    // wrap everything in a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);

    // `local.bind` causes everything to run inside a domain, just like `local.run` does, but it also lets the callback
    // return a value. In our case, all any of the codepaths return is a promise of `void`, but nextjs still counts on
    // getting that before it will finish the response.
    const boundHandler = local.bind(async () => {
      try {
        const currentScope = getCurrentHub().getScope();

        if (currentScope) {
          currentScope.addEventProcessor(event => addRequestDataToEvent(event, req as NextRequest));

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
              // TODO get this from next if possible, to avoid accidentally replacing non-dynamic parts of the path if
              // they match dynamic parts
              for (const [key, value] of Object.entries(req.query)) {
                reqPath = reqPath.replace(`${value}`, `[${key}]`);
              }
            }
            const reqMethod = `${(req.method || 'GET').toUpperCase()} `;

            const transaction = startTransaction(
              {
                name: `${reqMethod}${reqPath}`,
                op: 'http.server',
                ...traceparentData,
              },
              // extra context passed to the `tracesSampler`
              { request: req },
            );
            currentScope.setSpan(transaction);
          }
        }

        return await handler(req, res); // Call original handler
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
      }
    });

    return await boundHandler();
  };
};
