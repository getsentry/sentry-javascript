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
 * Keys listed in `maskAttributes` are masked even when `maskAllText` is false;
 * masking `value` on submit/button inputs without listing `value` still requires `maskAllText`.
 */
export function maskAttribute({
  el,
  key,
  maskAttributes,
  maskAllText,
  privacyOptions,
  value,
}: MaskAttributeParams): string {
  // unmaskTextSelector takes precedence
  if (privacyOptions.unmaskTextSelector && el.matches(privacyOptions.unmaskTextSelector)) {
    return value;
  }

  const masksNamedAttribute = maskAttributes.includes(key);
  // When `maskAllText` is enabled, also mask `value` on button-like inputs even if `value` is not listed.
  const masksSubmitButtonValue =
    maskAllText &&
    key === 'value' &&
    el.tagName === 'INPUT' &&
    ['submit', 'button'].includes(el.getAttribute('type') || '');

  if (masksNamedAttribute || masksSubmitButtonValue) {
    return value.replace(/[\S]/g, '*');
  }

  return value;
}
