import { captureException } from '@sentry/core';
import { addExceptionMechanism } from '@sentry/utils';

interface FunctionComponent {
  (...args: unknown[]): unknown;
}

interface ClassComponent {
  new (...args: unknown[]): {
    render(...args: unknown[]): unknown;
  };
}

function isReactClassComponent(target: unknown): target is ClassComponent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof target === 'function' && target?.prototype?.isReactComponent;
}

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export function wrapPageComponentWithSentry(pageComponent: FunctionComponent | ClassComponent): unknown {
  if (isReactClassComponent(pageComponent)) {
    return class SentryWrappedPageComponent extends pageComponent {
      public render(...args: unknown[]): unknown {
        try {
          return super.render(...args);
        } catch (e) {
          captureException(e, scope => {
            scope.addEventProcessor(event => {
              addExceptionMechanism(event, {
                handled: false,
              });
              return event;
            });

            return scope;
          });
          throw e;
        }
      }
    };
  } else if (typeof pageComponent === 'function') {
    return new Proxy(pageComponent, {
      apply(target, thisArg, argArray) {
        try {
          return target.apply(thisArg, argArray);
        } catch (e) {
          captureException(e, scope => {
            scope.addEventProcessor(event => {
              addExceptionMechanism(event, {
                handled: false,
              });
              return event;
            });

            return scope;
          });
          throw e;
        }
      },
    });
  } else {
    return pageComponent;
  }
}
