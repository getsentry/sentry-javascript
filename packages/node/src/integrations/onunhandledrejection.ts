import { captureException, withScope, configureScope } from '@sentry/shim';
import { Integration } from '@sentry/types';

// TODO: Find a way to create extedned interface that will work with our monkey-patch
// Because Domains are deprecated, it's not included in the Node.js types

// interface DomainedPromise extends Promise {
//   domain?: {
//     sentryContext?: {
//       extra?: {
//         unhandledPromiseRejection?: boolean;
//       };
//     };
//   };
// }

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUnhandledRejection';
  /**
   * @inheritDoc
   */
  public install(): void {
    global.process.on('unhandledRejection', (reason /** promise: any */) => {
      // TODO: Somehow get it merged with current scope
      // var context = (promise.domain && promise.domain.sentryContext) || {};
      withScope(() => {
        configureScope(scope => {
          scope.setExtra('unhandledPromiseRejection', true);
        });
        captureException(reason);
      });
    });
  }
}
