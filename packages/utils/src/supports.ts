import { logger } from './logger';
import { getGlobalObject } from './misc';

/**
 * Tells whether current environment supports ErrorEvent objects
 * {@link supportsErrorEvent}.
 *
 * @returns Answer to the given question.
 */
export function supportsErrorEvent(): boolean {
  try {
    // tslint:disable:no-unused-expression
    new ErrorEvent('');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tells whether current environment supports DOMError objects
 * {@link supportsDOMError}.
 *
 * @returns Answer to the given question.
 */
export function supportsDOMError(): boolean {
  try {
    // It really needs 1 argument, not 0.
    // Chrome: VM89:1 Uncaught TypeError: Failed to construct 'DOMError':
    // 1 argument required, but only 0 present.
    // @ts-ignore
    // tslint:disable:no-unused-expression
    new DOMError('');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tells whether current environment supports DOMException objects
 * {@link supportsDOMException}.
 *
 * @returns Answer to the given question.
 */
export function supportsDOMException(): boolean {
  try {
    // tslint:disable:no-unused-expression
    new DOMException('');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tells whether current environment supports Fetch API
 * {@link supportsFetch}.
 *
 * @returns Answer to the given question.
 */
export function supportsFetch(): boolean {
  if (!('fetch' in getGlobalObject<Window>())) {
    return false;
  }

  try {
    // tslint:disable-next-line:no-unused-expression
    new Headers();
    // tslint:disable-next-line:no-unused-expression
    new Request('');
    // tslint:disable-next-line:no-unused-expression
    new Response();
    return true;
  } catch (e) {
    return false;
  }
}
/**
 * isNativeFetch checks if the given function is a native implementation of fetch()
 */
function isNativeFetch(func: Function): boolean {
  return func && /^function fetch\(\)\s+\{\s+\[native code\]\s+\}$/.test(func.toString());
}

/**
 * Tells whether current environment supports Fetch API natively
 * {@link supportsNativeFetch}.
 *
 * @returns true if `window.fetch` is natively implemented, false otherwise
 */
export function supportsNativeFetch(): boolean {
  if (!supportsFetch()) {
    return false;
  }

  const global = getGlobalObject<Window>();

  // Fast path to avoid DOM I/O
  // tslint:disable-next-line:no-unbound-method
  if (isNativeFetch(global.fetch)) {
    return true;
  }

  // window.fetch is implemented, but is polyfilled or already wrapped (e.g: by a chrome extension)
  // so create a "pure" iframe to see if that has native fetch
  let result = false;
  const doc = global.document;
  // tslint:disable-next-line:no-unbound-method deprecation
  if (doc && typeof (doc.createElement as unknown) === `function`) {
    try {
      const sandbox = doc.createElement('iframe');
      sandbox.hidden = true;
      doc.head.appendChild(sandbox);
      if (sandbox.contentWindow && sandbox.contentWindow.fetch) {
        // tslint:disable-next-line:no-unbound-method
        result = isNativeFetch(sandbox.contentWindow.fetch);
      }
      doc.head.removeChild(sandbox);
    } catch (err) {
      logger.warn('Could not create sandbox iframe for pure fetch check, bailing to window.fetch: ', err);
    }
  }

  return result;
}

/**
 * Tells whether current environment supports ReportingObserver API
 * {@link supportsReportingObserver}.
 *
 * @returns Answer to the given question.
 */
export function supportsReportingObserver(): boolean {
  // tslint:disable-next-line: no-unsafe-any
  return 'ReportingObserver' in getGlobalObject();
}

/**
 * Tells whether current environment supports Referrer Policy API
 * {@link supportsReferrerPolicy}.
 *
 * @returns Answer to the given question.
 */
export function supportsReferrerPolicy(): boolean {
  // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default
  // https://caniuse.com/#feat=referrer-policy
  // It doesn't. And it throw exception instead of ignoring this parameter...
  // REF: https://github.com/getsentry/raven-js/issues/1233

  if (!supportsFetch()) {
    return false;
  }

  try {
    // tslint:disable:no-unused-expression
    new Request('_', {
      referrerPolicy: 'origin' as ReferrerPolicy,
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tells whether current environment supports History API
 * {@link supportsHistory}.
 *
 * @returns Answer to the given question.
 */
export function supportsHistory(): boolean {
  // NOTE: in Chrome App environment, touching history.pushState, *even inside
  //       a try/catch block*, will cause Chrome to output an error to console.error
  // borrowed from: https://github.com/angular/angular.js/pull/13945/files
  const global = getGlobalObject<Window>();
  const chrome = (global as any).chrome;
  // tslint:disable-next-line:no-unsafe-any
  const isChromePackagedApp = chrome && chrome.app && chrome.app.runtime;
  const hasHistoryApi = 'history' in global && !!global.history.pushState && !!global.history.replaceState;

  return !isChromePackagedApp && hasHistoryApi;
}
