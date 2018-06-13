import { captureException } from '@sentry/minimal';
import { Integration } from '@sentry/types';

/** onunhandledrejection is not standardized, thus not available on Window type */
interface PromisifiedWindow extends Window {
  onunhandledrejection?(event: PromiseRejectionEvent): void;
}

/** TODO: Change to safe window access, window||global||self||{} */
const _window: PromisifiedWindow = window;

/** Global Promise Rejection handler */
export class OnUnhandledRejection implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'OnUnhandledRejection';
  /**
   * @inheritDoc
   */
  public handler(event: PromiseRejectionEvent): void {
    captureException(event.reason);
  }
  /**
   * @inheritDoc
   */
  public install(): void {
    _window.addEventListener('unhandledrejection', this.handler.bind(
      this,
    ) as EventListener);
  }
}
