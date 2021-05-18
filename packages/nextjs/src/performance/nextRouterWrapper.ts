/* eslint-disable no-console */
import { Transaction, TransactionContext } from '@sentry/types';
import { fill } from '@sentry/utils';
import Router from 'next/router';

let activeTransaction: Transaction | undefined = undefined;
let prevTransactionId: string | undefined = undefined;
let startTransaction: StartTransactionCb | undefined = undefined;

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

/**
 * Wraps the Next.js Router's methods to add performance monitoring.
 * https://nextjs.org/docs/api-reference/next/router#router-object
 */
export function wrapRouter(startTransactionCb: StartTransactionCb, _startTransactionOnLocationChange: boolean): void {
  // TODO: if we aren't going to start transactions on location change, stop at this point.
  // Created spans don't have any transaction to attach to.

  startTransaction = startTransactionCb;

  // At this execution point, the router hasn't been created yet, so it cannot be wrapped.
  // However, we can use the following callback to wrap it once it's been created.
  Router.ready(() => {
    // There should always be a router at this point; but checking again purely for types.
    if (!Router.router) return;
    const router = Router.router;
    fill(Object.getPrototypeOf(router), 'push', pushWrapper); // create transactions
    // TODO: replace - create transactions
    // TODO: back - create transactions
    // TODO: reload - create transactions
    // TODO: beforepopstate - create span
    // TODO: prefetch - ignore it, outside of the page load
  });
}

type RouterPush = () => Promise<boolean>;
type WrappedRouterPush = RouterPush;

/**
 * Wraps the `push` of the Next.js client.
 * https://nextjs.org/docs/api-reference/next/router#routerpush
 */
export function pushWrapper(originalPush: RouterPush): WrappedRouterPush {
  // The additional arguments must have the same type as the original `push` function, see
  // https://github.com/vercel/next.js/blob/da97a18dafc7799e63aa7985adc95f213c2bf5f3/packages/next/next-server/lib/router/router.ts#L763
  // Not including it means leads to: `TypeError: Cannot read property 'auth' of undefined`, similar to
  // https://github.com/vercel/next.js/issues/11513
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    if (activeTransaction) {
      activeTransaction.finish();
    }
    if (!startTransaction) {
      // This should never happen, it's only for type checking bla bla bla
      return Promise.resolve(false);
    }
    activeTransaction = startTransaction({
      name: args[0], // url for now, it should be prevTransactionId
      op: 'navigation',
    });
    prevTransactionId = args[0]; // TODO: we might want to normalize the url in the future
    console.log(prevTransactionId);

    return originalPush.call(this, ...args);
  };
  return wrapper;
}
