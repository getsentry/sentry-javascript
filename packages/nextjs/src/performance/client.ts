/* eslint-disable no-console */
import { Primitive, Transaction, TransactionContext } from '@sentry/types';
import { fill } from '@sentry/utils';
import { default as Router } from 'next/router';

type StartTransactionCb = (context: TransactionContext) => Transaction | undefined;

let activeTransaction: Transaction | undefined = undefined;
let prevTransactionId: string | undefined = undefined;
let startTransaction: StartTransactionCb | undefined = undefined;

export function nextRouterInstrumentation(
  startTransactionCb: StartTransactionCb,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  // Spans that aren't attached to any transaction are lost; so if transactions aren't
  // created (besides potentially the onpageload transaction), no need to wrap the router.
  if (startTransactionOnLocationChange) {
    startTransaction = startTransactionCb;
    Router.ready(() => {
      const routerPrototype = Object.getPrototypeOf(Router.router);
      // TODO: fill `beforePopState`
      fill(routerPrototype, 'beforePopState', beforePopStateWrapper);

      // `withRouter` uses `useRouter` underneath:
      // https://github.com/vercel/next.js/blob/de42719619ae69fbd88e445100f15701f6e1e100/packages/next/client/with-router.tsx#L21
      // Router events also use the router:
      // https://github.com/vercel/next.js/blob/de42719619ae69fbd88e445100f15701f6e1e100/packages/next/client/router.ts#L92
      // `Router.changeState` handles the router state changes, so it may be enough to only wrap it
      // (instead of wrapping all of the Router's functions).
      fill(routerPrototype, 'changeState', changeStateWrapper);
    });
  }

  if (startTransactionOnPageLoad) {
    startTransactionCb({
      name: window.location.pathname,
      op: 'pageload',
    });
  }
}

type RouterChangeState = (method: string, url: string, as: string, options: Record<string, any>) => void;
type WrappedRouterChangeState = RouterChangeState;

function changeStateWrapper(originalChangeStateWrapper: RouterChangeState): WrappedRouterChangeState {
  const wrapper = function(
    this: any,
    method: string,
    url: string,
    as: string,
    options: Record<string, any>,
    // At the moment there are no additional arguments (meaning the rest parameter is empty).
    // This is meant to protect from the Next.js API being expanded and the SDK break apps down.
    ...args: any[]
  ): Promise<boolean> {
    if (activeTransaction) {
      activeTransaction.finish();
    }
    if (startTransaction !== undefined) {
      const tags: Record<string, Primitive> = {
        'routing.instrumentation': 'next-router',
        method,
        ...options,
      };
      if (prevTransactionId) {
        tags.from = prevTransactionId;
      }
      activeTransaction = startTransaction({
        name: url,
        op: 'navigation',
        tags,
      });
      prevTransactionId = url;
    }
    return originalChangeStateWrapper.call(this, method, url, as, options, ...args);
  };
  return wrapper;
}

// Next.js only cares when `beforePopState` returns `false`, but it can actually return anything.
// https://nextjs.org/docs/api-reference/next/router#routerbeforepopstate
type RouterBeforePopState = () => boolean | any;
type WrappedRouterBeforePopState = RouterBeforePopState;

function beforePopStateWrapper(originalBeforePopState: RouterBeforePopState): WrappedRouterBeforePopState {
  console.log('beforePopStateWrapper 1');
  const wrapper = function(this: any, ...args: any[]): any {
    console.log('beforePopStateWrapper 2');
    return originalBeforePopState.apply(this, args);
  };
  return wrapper;
}
