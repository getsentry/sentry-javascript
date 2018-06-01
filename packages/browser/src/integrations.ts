// import { captureException } from '@sentry/shim';
import { Integration } from '@sentry/types';

// onunhandledrejection is not standardized, thus not available on Window type
interface PromisifiedWindow extends Window {
  onunhandledrejection?(event: PromiseRejectionEvent): void;
}

/** TODO: Change to safe window access, window||global||self||{} */
const _window: PromisifiedWindow = window;

export class OnError implements Integration {
  install() {
    _window.onerror = () => {
      console.log('onerror');
    };
  }
}

export class OnUnhandledRejection implements Integration {
  install() {
    _window.onunhandledrejection = () => {
      console.log('onunhandledrejection');
    };
  }
}
