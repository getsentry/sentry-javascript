import type { ReplayIntegrationPrivacyOptions } from '../types';

type GetPrivacyOptions = Required<Omit<ReplayIntegrationPrivacyOptions, 'maskFn'>>;

interface GetPrivacyReturn {
  maskTextSelector: string;
  unmaskTextSelector: string;
  blockSelector: string;
  unblockSelector: string;
  ignoreSelector: string;

  blockClass?: RegExp;
  maskTextClass?: RegExp;
}

function getOption(selectors: string[], defaultSelectors: string[]): string {
  return [
    ...selectors,
    // sentry defaults
    ...defaultSelectors,
  ].join(',');
}

/**
 * Returns privacy related configuration for use in rrweb
 */
export function getPrivacyOptions({ mask, unmask, block, unblock, ignore }: GetPrivacyOptions): GetPrivacyReturn {
  const defaultBlockedElements = ['base[href="/"]'];

  const maskSelector = getOption(mask, ['.sentry-mask', '[data-sentry-mask]']);
  const unmaskSelector = getOption(unmask, []);

  const options: GetPrivacyReturn = {
    // We are making the decision to make text and input selectors the same
    maskTextSelector: maskSelector,
    unmaskTextSelector: unmaskSelector,

    blockSelector: getOption(block, ['.sentry-block', '[data-sentry-block]', ...defaultBlockedElements]),
    unblockSelector: getOption(unblock, []),
    ignoreSelector: getOption(ignore, ['.sentry-ignore', '[data-sentry-ignore]', 'input[type="file"]']),
  };

  return options;
}
