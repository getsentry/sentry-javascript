import { addTracingExtensions, captureException, configureScope, runWithAsyncContext } from '@sentry/core';
import { extractTraceparentData } from '@sentry/utils';
import { useEffect } from 'react';
import type { ClassComponent, FunctionComponent } from './types';
import { isReactClassComponent } from './utils/isReactClassComponent';

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export function wrapPageComponentWithSentry(pageComponent: FunctionComponent | ClassComponent): unknown {
  if (isReactClassComponent(pageComponent)) {
    return class SentryWrappedPageComponent extends pageComponent {
      public componentDidMount(...componentDidMountArgs: unknown[]): void {
        // TODO
        return super.componentDidUpdate.apply(this, componentDidMountArgs);
      }

      public componentDidUpdate(...componentDidUpdateArgs: unknown[]): void {
        if (this.props.userID !== prevProps.userID) {
          // TODO
        }

        return super.componentDidUpdate.apply(this, componentDidUpdateArgs);
      }
    };
  } else if (typeof pageComponent === 'function') {
    return new Proxy(pageComponent, {
      apply(target, thisArg, argArray: [{ error?: Error } | undefined]) {
        const err = argArray && argArray[0] && argArray[0].error;

        useEffect(() => {
          if (err !== undefined) {
            captureException(err, {
              mechanism: {
                handled: false,
              },
            });
          }
        }, [err]);

        return target.apply(thisArg, argArray);
      },
    });
  } else {
    return pageComponent;
  }
}
