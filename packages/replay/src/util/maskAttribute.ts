import type { getPrivacyOptions } from './getPrivacyOptions';

interface MaskAttributeParams {
  maskAttributes: string[];
  maskAllText: boolean;
  privacyOptions: ReturnType<typeof getPrivacyOptions>;
  key: string;
  value: string;
  el: HTMLElement;
}

/**
 * Masks an attribute if necessary, otherwise return attribute value as-is.
 */
export function maskAttribute({
  el,
  key,
  maskAttributes,
  maskAllText,
  privacyOptions,
  value,
}: MaskAttributeParams): string {
  // We only mask attributes if `maskAllText` is true
  if (!maskAllText) {
    return value;
  }

  // unmaskTextSelector takes precendence
  if (privacyOptions.unmaskTextSelector && el.matches(privacyOptions.unmaskTextSelector)) {
    return value;
  }

  if (
    maskAttributes.includes(key) ||
    // Need to mask `value` attribute for `<input>` if it's a button-like
    // type
    (key === 'value' && el.tagName === 'INPUT' && ['submit', 'button'].includes(el.getAttribute('type') || ''))
  ) {
    return value.replace(/[\S]/g, '*');
  }

  return value;
}
