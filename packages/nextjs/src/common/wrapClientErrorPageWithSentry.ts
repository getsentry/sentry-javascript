import { captureException } from '@sentry/core';
import { useEffect } from 'react';
import type { ClassComponent, FunctionComponent } from './types';
import { isReactClassComponent } from './utils/isReactClassComponent';

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export function wrapClientErrorPageWithSentry(pageComponent: FunctionComponent | ClassComponent): unknown {
  if (isReactClassComponent(pageComponent)) {
    return class SentryWrappedPageComponent extends pageComponent {
      public componentDidMount(...componentDidMountArgs: unknown[]): void {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const err: unknown = ((this.props as any) || {}).error;

        if (err) {
          captureException(err, {
            mechanism: {
              handled: false,
            },
          });
        }

        if (super.componentDidMount) {
          return super.componentDidMount.apply(this, componentDidMountArgs);
        }
      }

      public componentDidUpdate(...componentDidUpdateArgs: [unknown]): void {
        const prevProps = componentDidUpdateArgs[0];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const prevError: unknown = ((prevProps as any) || {}).error;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        const currError: unknown = ((this.props as any) || {}).error;

        if (currError && prevError !== currError) {
          captureException(currError, {
            mechanism: {
              handled: false,
            },
          });
        }

        if (super.componentDidUpdate) {
          return super.componentDidUpdate.apply(this, componentDidUpdateArgs);
        }
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
