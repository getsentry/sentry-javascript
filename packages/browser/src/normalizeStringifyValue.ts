import { htmlTreeAsString, isElement } from '@sentry/browser-utils';

type Prototype = { constructor?: (...args: unknown[]) => unknown };

const HTML_ELEMENT_CONSTRUCTOR_NAME_REGEX = /^HTML(\w*)Element$/;

/**
 * Browser-specific contributions to `normalize()`'s `stringifyValue`. Plug into
 * `setNormalizeStringifier` from the browser SDK so DOM values get a useful string
 * representation without forcing core to carry the DOM-specific code.
 *
 * Handles:
 * - `window` → `[Window]`
 * - `document` → `[Document]`
 * - `HTMLElement` subclasses → `[HTMLElement: <css-selector-path>]` (via `htmlTreeAsString`)
 *
 * Vue ViewModels and React SyntheticEvents are not handled here — the Vue and React
 * SDKs wrap this function in their `init` and add their own checks on top.
 */
export function normalizeStringifyValue(value: Exclude<unknown, string | number | boolean | null>): string | undefined {
  // oxlint-disable-next-line no-restricted-globals
  if (typeof window !== 'undefined' && value === window) {
    return '[Window]';
  }
  // oxlint-disable-next-line no-restricted-globals
  if (typeof document !== 'undefined' && value === document) {
    return '[Document]';
  }

  if (isElement(value)) {
    const objName = getConstructorName(value);
    if (HTML_ELEMENT_CONSTRUCTOR_NAME_REGEX.test(objName)) {
      return `[HTMLElement: ${htmlTreeAsString(value)}]`;
    }
  }

  return undefined;
}

function getConstructorName(value: unknown): string {
  const prototype: Prototype | null = Object.getPrototypeOf(value);

  return prototype?.constructor ? prototype.constructor.name : 'null prototype';
}
