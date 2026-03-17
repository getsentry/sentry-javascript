import { DEBUG_BUILD } from '../debug-build';
import { debug } from './debug-logger';
import { GLOBAL_OBJ } from './worldwide';

const WINDOW = GLOBAL_OBJ as unknown as Window;

declare const EdgeRuntime: string | undefined;

/**
 * Tells whether current environment supports ErrorEvent objects
 * {@link supportsErrorEvent}.
 *
 * @returns Answer to the given question.
 */
export function supportsErrorEvent(): boolean {
  try {
    new ErrorEvent('');
    return true;
  } catch {
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
    // Chrome: VM89:1 Uncaught TypeError: Failed to construct 'DOMError':
    // 1 argument required, but only 0 present.
    // @ts-expect-error It really needs 1 argument, not 0.
    new DOMError('');
    return true;
  } catch {
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
    new DOMException('');
    return true;
  } catch {
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
  return 'history' in WINDOW && !!WINDOW.history;
}

/**
 * Tells whether current environment supports Fetch API
 * {@link supportsFetch}.
 *
 * @returns Answer to the given question.
 * @deprecated This is no longer used and will be removed in a future major version.
 */
export const supportsFetch = _isFetchSupported;

function _isFetchSupported(): boolean {
  if (!('fetch' in WINDOW)) {
    return false;
  }

  try {
    new Headers();
    // Deno requires a valid URL so '' cannot be used as an argument
    new Request('data:,');
    new Response();
    return true;
  } catch {
    return false;
  }
}

/**
 * isNative checks if the given function is a native implementation
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function isNativeFunction(func: Function): boolean {
  return func && /\[native code\]/.test(func.toString());
}

/**
 * Tells whether current environment supports Fetch API natively
 * {@link supportsNativeFetch}.
 *
 * @returns true if `window.fetch` is natively implemented, false otherwise
 */
export function supportsNativeFetch(): boolean {
  if (typeof EdgeRuntime === 'string') {
    return true;
  }

  return _isFetchSupported();
}

/**
 * Tells whether current environment supports ReportingObserver API
 * {@link supportsReportingObserver}.
 *
 * @returns Answer to the given question.
 */
export function supportsReportingObserver(): boolean {
  return 'ReportingObserver' in WINDOW;
}

/**
 * Tells whether current environment supports Referrer Policy API
 * {@link supportsReferrerPolicy}.
 *
 * @returns Answer to the given question.
 * @deprecated This is no longer used and will be removed in a future major version.
 */
export function supportsReferrerPolicy(): boolean {
  // Despite all stars in the sky saying that Edge supports old draft syntax, aka 'never', 'always', 'origin' and 'default'
  // (see https://caniuse.com/#feat=referrer-policy),
  // it doesn't. And it throws an exception instead of ignoring this parameter...
  // REF: https://github.com/getsentry/raven-js/issues/1233

  if (!_isFetchSupported()) {
    return false;
  }

  try {
    new Request('_', {
      referrerPolicy: 'origin' as ReferrerPolicy,
    });
    return true;
  } catch {
    return false;
  }
}
