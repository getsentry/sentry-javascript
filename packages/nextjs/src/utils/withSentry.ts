import { captureException, flush, getCurrentHub, Handlers, startTransaction } from '@sentry/node';
import { extractTraceparentData, hasTracingEnabled } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { addExceptionMechanism, isString, logger, objectify, stripUrlQueryAndFragment } from '@sentry/utils';
import * as domain from 'domain';
import { NextApiHandler, NextApiResponse } from 'next';

const { parseRequest } = Handlers;

// purely for clarity
type WrappedNextApiHandler = NextApiHandler;

export type AugmentedNextApiResponse = NextApiResponse & {
  __sentryTransaction?: Transaction;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const withSentry = (origHandler: NextApiHandler): WrappedNextApiHandler => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (req, res) => {
    // first order of business: monkeypatch `res.end()` so that it will wait for us to send events to sentry before it
    // fires (if we don't do this, the lambda will close too early and events will be either delayed or lost)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    res.end = wrapEndMethod(res.end);

    // use a domain in order to prevent scope bleed between requests
    const local = domain.create();
    local.add(req);
    local.add(res);

    // `local.bind` causes everything to run inside a domain, just like `local.run` does, but it also lets the callback
    // return a value. In our case, all any of the codepaths return is a promise of `void`, but nextjs still counts on
    // getting that before it will finish the response.
    const boundHandler = local.bind(async () => {
      const currentScope = getCurrentHub().getScope();

      if (currentScope) {
        currentScope.addEventProcessor(event => parseRequest(event, req));

        if (hasTracingEnabled()) {
          // If there is a trace header set, extract the data from it (parentSpanId, traceId, and sampling decision)
          let traceparentData;
          if (req.headers && isString(req.headers['sentry-trace'])) {
            traceparentData = extractTraceparentData(req.headers['sentry-trace']);
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

          // save a link to the transaction on the response, so that even if there's an error (landing us outside of
          // the domain), we can still finish it (albeit possibly missing some scope data)
          (res as AugmentedNextApiResponse).__sentryTransaction = transaction;
        }
      }

      try {
        const handlerResult = await origHandler(req, res);

        // Temporarily mark the response as finished, as a hack to get nextjs to not complain that we're coming back
        // from the handler successfully without `res.end()` having completed its work.  This is necessary (and we know
        // we can do it safely) for a few reasons:
        //
        // - Normally, `res.end()` is sync and completes before the request handler returns, as part of the handler
        //   sending data back to the client. As soon as the handler is done, nextjs checks to make sure that the
        //   response is indeed finished. (`res.end()` signals this by setting `res.finished` to `true`.) If it isn't,
        //   nextjs complains. ("Warning: API resolved without sending a response for <url>.")
        //
        // - In order to prevent the lambda running the route handler from shutting down before we can send events to
        //   Sentry, we monkeypatch `res.end()` so that we can call `flush()`, wait for it to finish, and only then
        //   allow the response to be marked complete. This turns the normally-sync `res.end()` into an async function,
        //   which isn't awaited because it's assumed to still be sync. As a result, nextjs runs the aforementioned
        //   check before the now-async `res.end()` has had a chance to set `res.finished = false`, and therefore thinks
        //   there's a problem when there's not.
        //
        // - In order to trick nextjs into not complaining, we can set `res.finished` to `true` before exiting the
        //   handler. If we do that, though, `res.end()` gets mad because it thinks *it* should be the one to get to
        //   mark the response complete. We therefore need to flip it back to `false` 1) after nextjs's check but 2)
        //   before the original `res.end()` is called.
        //
        // - The second part is easy - we control when the original `res.end()` is called, so we can do the flipping
        //   right beforehand and `res.end()` will be none the wiser.
        //
        // - The first part isn't as obvious. How do we know we won't end up with a race condition, such that the
        //   flipping to `false` might happen before the check, negating the entire purpose of this hack? Fortunately,
        //   before it's done, our async `res.end()` wrapper has to await a `setImmediate()` callback, guaranteeing its
        //   run lasts at least until the next event loop. The check, on the other hand, happens synchronously,
        //   immediately after the request handler (so in the same event loop). So as long as we wait to flip
        //   `res.finished` back to `false` until after the `setImmediate` callback has run, we know we'll be safely in
        //   the next event loop when we do so.
        //
        // And with that, everybody's happy: Nextjs doesn't complain about an unfinished response, `res.end()` doesn’t
        // complain about an already-finished response, and we have time to make sure events are flushed to Sentry.
        //
        // One final note: It might seem like making `res.end()` an awaited async function would run the danger of
        // having the lambda close before it's done its thing, meaning we *still* might not get events sent to Sentry.
        // Fortunately, even though it's called `res.end()`, and even though it's normally sync, a) it's far from the
        // end of the request process, so there's other stuff which needs to happen before the lambda can close in any
        // case, and b) that other stuff isn't triggered until `res.end()` emits a `prefinished` event, so even though
        // it's not technically awaited, it's still the case that the process can't go on until it's done.
        //
        // See
        // https://github.com/vercel/next.js/blob/e1464ae5a5061ae83ad015018d4afe41f91978b6/packages/next/server/api-utils.ts#L106-L118
        // and
        // https://github.com/nodejs/node/blob/d8f1823d5fca5e3c00b19530fb15343fdd3c8bf5/lib/_http_outgoing.js#L833-L911.
        res.finished = true;

        return handlerResult;
      } catch (e) {
        // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
        // store a seen flag on it. (Because of the one-way-on-Vercel-one-way-off-of-Vercel approach we've been forced
        // to take, it can happen that the same thrown object gets caught in two different ways, and flagging it is a
        // way to prevent it from actually being reported twice.)
        const objectifiedErr = objectify(e);

        if (currentScope) {
          currentScope.addEventProcessor(event => {
            addExceptionMechanism(event, {
              type: 'instrument',
              handled: true,
              data: {
                wrapped_handler: origHandler.name,
                function: 'withSentry',
              },
            });
            return event;
          });

          captureException(objectifiedErr);
        }

        // We rethrow here so that nextjs can do with the error whatever it would normally do. (Sometimes "whatever it
        // would normally do" is to allow the error to bubble up to the global handlers - another reason we need to mark
        // the error as already having been captured.)
        throw objectifiedErr;
      }
    });

    // Since API route handlers are all async, nextjs always awaits the return value (meaning it's fine for us to return
    // a promise here rather than a real result, and it saves us the overhead of an `await` call.)
    return boundHandler();
  };
};

type ResponseEndMethod = AugmentedNextApiResponse['end'];
type WrappedResponseEndMethod = AugmentedNextApiResponse['end'];

/**
 * Wrap `res.end()` so that it closes the transaction and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe', as explained in detail in the long comment in the main
 * `withSentry()` function.
 *
 * @param origEnd The original `res.end()` method
 * @returns The wrapped version
 */
function wrapEndMethod(origEnd: ResponseEndMethod): WrappedResponseEndMethod {
  return async function newEnd(this: AugmentedNextApiResponse, ...args: unknown[]) {
    await finishSentryProcessing(this);

    // If the request didn't error, we will have temporarily marked the response finished to avoid a nextjs warning
    // message. (See long note above.) Now we need to flip `finished` back to `false` so that the real `res.end()`
    // method doesn't throw `ERR_STREAM_WRITE_AFTER_END` (which it will if presented with an already-finished response).
    this.finished = false;

    return origEnd.call(this, ...args);
  };
}

/**
 * Close the open transaction (if any) and flush events to Sentry.
 *
 * @param res The outgoing response for this request, on which the transaction is stored
 */
async function finishSentryProcessing(res: AugmentedNextApiResponse): Promise<void> {
  const { __sentryTransaction: transaction } = res;

  if (transaction) {
    transaction.setHttpStatus(res.statusCode);

    // Push `transaction.finish` to the next event loop so open spans have a better chance of finishing before the
    // transaction closes, and make sure to wait until that's done before flushing events
    const transactionFinished: Promise<void> = new Promise(resolve => {
      setImmediate(() => {
        transaction.finish();
        resolve();
      });
    });
    await transactionFinished;
  }

  // Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda
  // ends. If there was an error, rethrow it so that the normal exception-handling mechanisms can apply.
  try {
    logger.log('Flushing events...');
    await flush(2000);
    logger.log('Done flushing events');
  } catch (e) {
    logger.log(`Error while flushing events:\n${e}`);
  }
}
