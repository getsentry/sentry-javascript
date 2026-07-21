import { isString } from '@sentry/core';

const DEFAULT_MAX_STRING_LENGTH = 80;

type SimpleNode = {
  parentNode: SimpleNode;
} | null;

// Native DOM accessors cached at module load. Calling these instead of reading
// instance properties bypasses user-defined getters that shadow the prototypes.
// Stored unbound and rebound via .call(el) — the unbound-method lint is expected.
// See https://github.com/getsentry/sentry-javascript/issues/21353
type AccessorKey = 'parentNode' | 'tagName' | 'id' | 'className' | 'getAttribute' | 'dataset';
const accessors: Partial<Record<AccessorKey, Function>> = {};

// oxlint-disable typescript-eslint(unbound-method)
try {
  if (typeof Node !== 'undefined') {
    accessors.parentNode = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode')!.get!;
  }
  if (typeof Element !== 'undefined') {
    accessors.tagName = Object.getOwnPropertyDescriptor(Element.prototype, 'tagName')!.get!;
    accessors.id = Object.getOwnPropertyDescriptor(Element.prototype, 'id')!.get!;
    accessors.className = Object.getOwnPropertyDescriptor(Element.prototype, 'className')!.get!;
    accessors.getAttribute = Element.prototype.getAttribute;
  }
  if (typeof HTMLElement !== 'undefined') {
    accessors.dataset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'dataset')!.get!;
  }
} catch {
  // Polyfilled or stubbed prototypes may not have the expected descriptors.
  // _safeRead falls back to direct property access.
}
// oxlint-enable typescript-eslint(unbound-method)

function _safeRead<T>(el: unknown, prop: AccessorKey, arg?: string): T {
  const fn = accessors[prop];
  if (fn) {
    try {
      return fn.call(el, arg) as T;
    } catch {
      // Fall through to direct access
    }
  }
  const val = (el as Record<string, unknown>)[prop];
  return typeof val === 'function' ? val.call(el, arg) : (val as T);
}

/**
 * Given a child DOM element, returns a query-selector statement describing that
 * and its ancestors
 * e.g. [HTMLElement] => body > div > input#foo.btn[name=baz]
 * @returns generated DOM path
 */
export function htmlTreeAsString(
  elem: unknown,
  options: string[] | { keyAttrs?: string[]; maxStringLength?: number } = {},
): string {
  if (!elem) {
    return '<unknown>';
  }

  // try/catch both:
  // - accessing event.target (see getsentry/raven-js#838, #768)
  // - `htmlTreeAsString` because it's complex, and just accessing the DOM incorrectly
  // - can throw an exception in some circumstances.
  try {
    let currentElem = elem as SimpleNode;
    const MAX_TRAVERSE_HEIGHT = 5;
    const out = [];
    let height = 0;
    let len = 0;
    const separator = ' > ';
    const sepLength = separator.length;
    let nextStr;
    const keyAttrs = Array.isArray(options) ? options : options.keyAttrs;
    const maxStringLength = (!Array.isArray(options) && options.maxStringLength) || DEFAULT_MAX_STRING_LENGTH;

    while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
      nextStr = _htmlElementAsString(currentElem, keyAttrs);
      // bail out if
      // - nextStr is the 'html' element
      // - the length of the string that would be created exceeds maxStringLength
      //   (ignore this limit if we are on the first iteration)
      if (nextStr === 'html' || (height > 1 && len + out.length * sepLength + nextStr.length >= maxStringLength)) {
        break;
      }

      out.push(nextStr);

      len += nextStr.length;
      currentElem = _safeRead<SimpleNode>(currentElem, 'parentNode');
    }

    return out.reverse().join(separator);
  } catch {
    return '<unknown>';
  }
}

/**
 * Returns a simple, query-selector representation of a DOM element
 * e.g. [HTMLElement] => input#foo.btn[name=baz]
 * @returns generated DOM path
 */
function _htmlElementAsString(el: unknown, keyAttrs?: string[]): string {
  const out = [];

  const tagName = _safeRead<string | undefined>(el, 'tagName');
  if (!tagName) {
    return '';
  }

  if (typeof HTMLElement !== 'undefined') {
    // If using the component name annotation plugin, this value may be available on the DOM node
    if (el instanceof HTMLElement) {
      const dataset = _safeRead<DOMStringMap | undefined>(el, 'dataset');
      if (dataset) {
        if (dataset['sentryComponent']) {
          return dataset['sentryComponent'];
        }
        if (dataset['sentryElement']) {
          return dataset['sentryElement'];
        }
      }
    }
  }

  out.push(tagName.toLowerCase());

  // Pairs of attribute keys defined in `serializeAttribute` and their values on element.
  const keyAttrPairs = keyAttrs?.length
    ? keyAttrs
        .filter(keyAttr => _safeRead<string | null>(el, 'getAttribute', keyAttr))
        .map(keyAttr => [keyAttr, _safeRead<string | null>(el, 'getAttribute', keyAttr)])
    : null;

  if (keyAttrPairs?.length) {
    keyAttrPairs.forEach(keyAttrPair => {
      out.push(`[${keyAttrPair[0]}="${keyAttrPair[1]}"]`);
    });
  } else {
    const id = _safeRead<string | undefined>(el, 'id');
    if (id) {
      out.push(`#${id}`);
    }

    const className = _safeRead<string | undefined>(el, 'className');
    if (className && isString(className)) {
      const classes = className.split(/\s+/);
      for (const c of classes) {
        out.push(`.${c}`);
      }
    }
  }
  for (const k of ['aria-label', 'type', 'name', 'title', 'alt']) {
    const attr = _safeRead<string | null>(el, 'getAttribute', k);
    if (attr) {
      out.push(`[${k}="${attr}"]`);
    }
  }

  return out.join('');
}
