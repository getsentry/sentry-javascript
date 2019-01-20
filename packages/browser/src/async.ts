import { SentryEvent, Severity } from '@sentry/types';
import { BrowserOptions } from './backend';
import { ReportDialogOptions } from './client';

let sentry: Promise<typeof import('./index')> | null = null;
let initOpts: BrowserOptions | undefined;

const oldOnunhandledrejection = window.onunhandledrejection;
const oldOnerror = window.onerror;

/**
 * Loads sentry on demand or returns cached result
 */
async function getsentry(): Promise<typeof import('./index')> {
  if (sentry) {
    return sentry;
  }
  return (sentry = import(/* webpackChunkName: "sentry" */ './index').then(mod => {
    window.onunhandledrejection = oldOnunhandledrejection;
    mod.init(initOpts);
    return mod;
  }));
}

window.onerror = async (message, source, lineno, colno, exception) => {
  if (oldOnerror) {
    // @ts-ignore
    oldOnerror.apply(window, arguments);
  }
  await getsentry();
  window.onerror(message, source, lineno, colno, exception);
};

window.onunhandledrejection = async exception => {
  if (oldOnunhandledrejection) {
    // @ts-ignore
    oldOnunhandledrejection.apply(window, arguments);
  }
  await getsentry();
  if (window.onunhandledrejection) {
    window.onunhandledrejection(exception);
  }
};

/**
 * Lazily proxies Sentry.init()
 * @see Sentry.init
 */
export function init(options?: BrowserOptions): void {
  initOpts = options;
}

/**
 * Proxies Sentry.captureException()
 * @see Sentry.captureException
 */
export async function captureException(exception: any): Promise<string> {
  const s = await getsentry();
  return s.captureException(exception);
}

/**
 * Proxies Sentry.captureEvent()
 * @see Sentry.captureEvent
 */
export async function captureEvent(event: SentryEvent): Promise<string> {
  const s = await getsentry();
  return s.captureEvent(event);
}

/**
 * Proxies Sentry.captureMessage()
 * @see Sentry.captureMessage
 */
export async function captureMessage(message: string, level?: Severity): Promise<string> {
  const s = await getsentry();
  return s.captureMessage(message, level);
}

/**
 * Proxies Sentry.showReportDialog()
 * @see Sentry.showReportDialog
 */
export async function showReportDialog(options?: ReportDialogOptions): Promise<void> {
  const s = await getsentry();
  s.showReportDialog(options);
}

export { addBreadcrumb, configureScope, withScope } from '@sentry/minimal';
