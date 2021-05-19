/* eslint-disable no-console */
import { Transaction, TransactionContext } from '@sentry/types';
import { fill } from '@sentry/utils';
import Router from 'next/router';

let activeTransaction: Transaction | undefined = undefined;
// let prevTransactionId: string | undefined = undefined;
let startTransaction: StartTransactionCb | undefined = undefined;

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

/**
 * Wraps the Next.js Router's methods to add performance monitoring.
 * https://nextjs.org/docs/api-reference/next/router#router-object
 */
export function wrapRouter(startTransactionCb: StartTransactionCb, startTransactionOnLocationChange: boolean): void {
  // Spans that aren't attached to any transaction are lost; so if transactions aren't
  // created, no need to wrap the router.
  if (!startTransactionOnLocationChange) return;

  startTransaction = startTransactionCb;

  // At this execution point, the router hasn't been created yet, so it cannot be wrapped.
  // However, we can use the following callback to wrap it once it's been created.
  Router.ready(() => {
    const routerPrototype = Object.getPrototypeOf(Router.router);
    fill(routerPrototype, 'push', pushWrapper); // create transactions
    fill(routerPrototype, 'replace', replaceWrapper); // create transactions
    // Ignore `prefetch`, since its outside of the page load
    fill(routerPrototype, 'beforePopState', beforePopStateWrapper); // create spans
    fill(routerPrototype, 'back', backWrapper); // create transactions
    fill(routerPrototype, 'reload', reloadWrapper); // create transactions
  });
}

/**
 * Closes previous transaction (if required) and starts a new one.
 */
function startNewTransaction(toUrl: any, transactionOp: string = 'navigation'): void {
  if (activeTransaction) activeTransaction.finish();
  if (!startTransaction) {
    // This should never happen, adding it for type checking purposes.
    return;
  }

  activeTransaction = startTransaction({
    name: toUrl, // TODO: should this be normalized?
    op: transactionOp,
  });
}

type RouterPush = () => Promise<boolean>;
type WrappedRouterPush = RouterPush;

function pushWrapper(originalPush: RouterPush): WrappedRouterPush {
  // The additional arguments must have the same type as the original `push` function, see
  // https://github.com/vercel/next.js/blob/da97a18dafc7799e63aa7985adc95f213c2bf5f3/packages/next/next-server/lib/router/router.ts#L763
  // Not including it means leads to: `TypeError: Cannot read property 'auth' of undefined`, similar to
  // https://github.com/vercel/next.js/issues/11513
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    startNewTransaction(args[0]); // The URL being pushed
    return originalPush.call(this, ...args);
  };
  return wrapper;
}

type RouterReplace = () => Promise<boolean>;
type WrappedRouterReplace = RouterReplace;

function replaceWrapper(originalReplace: RouterReplace): WrappedRouterReplace {
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    return originalReplace.apply(this, args);
  };
  return wrapper;
}

type RouterBeforePopState = () => Promise<boolean>;
type WrappedRouterBeforePopState = RouterReplace;

function beforePopStateWrapper(originalBeforePopState: RouterBeforePopState): WrappedRouterBeforePopState {
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    // TODO: create a span
    return originalBeforePopState.apply(this, args);
  };
  return wrapper;
}

type RouterBack = () => Promise<boolean>;
type WrappedRouterBack = RouterReplace;

function backWrapper(originalBack: RouterBack): WrappedRouterBack {
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    return originalBack.apply(this, args);
  };
  return wrapper;
}

type RouterReload = () => Promise<boolean>;
type WrappedRouterReload = RouterReplace;

function reloadWrapper(originalReload: RouterReload): WrappedRouterReload {
  const wrapper = function(this: any, ...args: any[]): Promise<boolean> {
    // TODO
    return originalReload.apply(this, args);
  };
  return wrapper;
}
