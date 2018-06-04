import { captureException } from '@sentry/shim';
import { Integration } from '@sentry/types';
// @ts-ignore
import { TraceKit } from './tracekit';
import { Raven } from './raven';

// onunhandledrejection is not standardized, thus not available on Window type
interface PromisifiedWindow extends Window {
  onunhandledrejection?(event: PromiseRejectionEvent): void;
}

/** TODO: Change to safe window access, window||global||self||{} */
const _window: PromisifiedWindow = window;

export class OnError implements Integration {
  name: string = 'OnError';
  handler: Function = Raven._handleOnErrorStackInfo.bind(Raven);
  install() {
    TraceKit && TraceKit.report && TraceKit.report.subscribe(this.handler);
  }
  uninstall() {
    TraceKit && TraceKit.report && TraceKit.report.unsubscribe(this.handler);
  }
}

export class OnUnhandledRejection implements Integration {
  name: string = 'OnUnhandledRejection';
  handler: Function = (event: PromiseRejectionEvent) => {
    captureException(event.reason);
  };
  install() {
    _window.addEventListener &&
      _window.addEventListener('unhandledrejection', this
        .handler as EventListener);
  }
  uninstall() {
    _window.removeEventListener &&
      _window.removeEventListener('unhandledrejection', this
        .handler as EventListener);
  }
}
