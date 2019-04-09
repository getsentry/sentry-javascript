import { Event, Mechanism, WrappedFunction } from '@sentry/types';

/** Internal */
interface SentryGlobal {
  __SENTRY__: {
    globalEventProcessors: any;
    hub: any;
    logger: any;
  };
}

/**
 * Requires a module which is protected _against bundler minification.
 *
 * @param request The module path to resolve
 */
export function dynamicRequire(mod: NodeModule, request: string): any {
  return mod.require(request);
}

/**
 * Checks whether we're in the Node.js or Browser environment
 *
 * @returns Answer to given question
 */
export function isNodeEnv(): boolean {
  // tslint:disable:strict-type-predicates
  return Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]';
}

const fallbackGlobalObject = {};

/**
 * Safely get global scope object
 *
 * @returns Global scope object
 */
// tslint:disable:strict-type-predicates
export function getGlobalObject<T>(): T & SentryGlobal {
  return (isNodeEnv()
    ? global
    : typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
    ? self
    : fallbackGlobalObject) as T & SentryGlobal;
}
// tslint:enable:strict-type-predicates

/**
 * Extended Window interface that allows for Crypto API usage in IE browsers
 */
interface MsCryptoWindow extends Window {
  msCrypto?: Crypto;
}

/**
 * UUID4 generator
 *
 * @returns string Generated UUID4.
 */
export function uuid4(): string {
  const global = getGlobalObject() as MsCryptoWindow;
  const crypto = global.crypto || global.msCrypto;

  if (!(crypto === void 0) && crypto.getRandomValues) {
    // Use window.crypto API if available
    const arr = new Uint16Array(8);
    crypto.getRandomValues(arr);

    // set 4 in byte 7
    // tslint:disable-next-line:no-bitwise
    arr[3] = (arr[3] & 0xfff) | 0x4000;
    // set 2 most significant bits of byte 9 to '10'
    // tslint:disable-next-line:no-bitwise
    arr[4] = (arr[4] & 0x3fff) | 0x8000;

    const pad = (num: number): string => {
      let v = num.toString(16);
      while (v.length < 4) {
        v = `0${v}`;
      }
      return v;
    };

    return (
      pad(arr[0]) + pad(arr[1]) + pad(arr[2]) + pad(arr[3]) + pad(arr[4]) + pad(arr[5]) + pad(arr[6]) + pad(arr[7])
    );
  }
  // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    // tslint:disable-next-line:no-bitwise
    const r = (Math.random() * 16) | 0;
    // tslint:disable-next-line:no-bitwise
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Parses string form of URL into an object
 * // borrowed from https://tools.ietf.org/html/rfc3986#appendix-B
 * // intentionally using regex and not <a/> href parsing trick because React Native and other
 * // environments where DOM might not be available
 * @returns parsed URL object
 */
export function parseUrl(
  url: string,
): {
  host?: string;
  path?: string;
  protocol?: string;
  relative?: string;
} {
  if (!url) {
    return {};
  }

  const match = url.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);

  if (!match) {
    return {};
  }

  // coerce to undefined values to empty string so we don't get 'undefined'
  const query = match[6] || '';
  const fragment = match[8] || '';
  return {
    host: match[4],
    path: match[5],
    protocol: match[2],
    relative: match[5] + query + fragment, // everything minus origin
  };
}

/**
 * Extracts either message or type+value from an event that can be used for user-facing logs
 * @returns event's description
 */
export function getEventDescription(event: Event): string {
  if (event.message) {
    return event.message;
  }
  if (event.exception && event.exception.values && event.exception.values[0]) {
    const exception = event.exception.values[0];

    if (exception.type && exception.value) {
      return `${exception.type}: ${exception.value}`;
    }
    return exception.type || exception.value || event.event_id || '<unknown>';
  }
  return event.event_id || '<unknown>';
}

/** JSDoc */
interface ExtensibleConsole extends Console {
  [key: string]: any;
}

/** JSDoc */
export function consoleSandbox(callback: () => any): any {
  const global = getGlobalObject<Window>();
  const levels = ['debug', 'info', 'warn', 'error', 'log'];

  if (!('console' in global)) {
    return callback();
  }

  const originalConsole = global.console as ExtensibleConsole;
  const wrappedLevels: { [key: string]: any } = {};

  // Restore all wrapped console methods
  levels.forEach(level => {
    if (level in global.console && (originalConsole[level] as WrappedFunction).__sentry__) {
      wrappedLevels[level] = (originalConsole[level] as WrappedFunction).__sentry_wrapped__;
      originalConsole[level] = (originalConsole[level] as WrappedFunction).__sentry_original__;
    }
  });

  // Perform callback manipulations
  const result = callback();

  // Revert restoration to wrapped state
  Object.keys(wrappedLevels).forEach(level => {
    originalConsole[level] = wrappedLevels[level];
  });

  return result;
}

/**
 * Adds exception values, type and value to an synthetic Exception.
 * @param event The event to modify.
 * @param value Value of the exception.
 * @param type Type of the exception.
 * @param mechanism Mechanism of the exception.
 * @hidden
 */
export function addExceptionTypeValue(
  event: Event,
  value?: string,
  type?: string,
  mechanism: Mechanism = {
    handled: true,
    type: 'generic',
  },
): void {
  event.exception = event.exception || {};
  event.exception.values = event.exception.values || [];
  event.exception.values[0] = event.exception.values[0] || {};
  event.exception.values[0].value = event.exception.values[0].value || value || '';
  event.exception.values[0].type = event.exception.values[0].type || type || 'Error';
  event.exception.values[0].mechanism = event.exception.values[0].mechanism || mechanism;
}
