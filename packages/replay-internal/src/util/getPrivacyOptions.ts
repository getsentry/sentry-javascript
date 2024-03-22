import { consoleSandbox } from '@sentry/utils';

import type { DeprecatedPrivacyOptions, ReplayIntegrationPrivacyOptions } from '../types';

type GetPrivacyOptions = Required<Omit<ReplayIntegrationPrivacyOptions, 'maskFn'>> &
  Omit<DeprecatedPrivacyOptions, 'maskInputOptions'>;
interface GetPrivacyReturn {
  maskTextSelector: string;
  unmaskTextSelector: string;
  blockSelector: string;
  unblockSelector: string;
  ignoreSelector: string;

  blockClass?: RegExp;
  maskTextClass?: RegExp;
}

function getOption(
  selectors: string[],
  defaultSelectors: string[],
  deprecatedClassOption?: string | RegExp,
  deprecatedSelectorOption?: string,
): string {
  const deprecatedSelectors = typeof deprecatedSelectorOption === 'string' ? deprecatedSelectorOption.split(',') : [];

  const allSelectors = [
    ...selectors,
    // @deprecated
    ...deprecatedSelectors,

    // sentry defaults
    ...defaultSelectors,
  ];

  // @deprecated
  if (typeof deprecatedClassOption !== 'undefined') {
    // NOTE: No support for RegExp
    if (typeof deprecatedClassOption === 'string') {
      allSelectors.push(`.${deprecatedClassOption}`);
    }

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(
        '[Replay] You are using a deprecated configuration item for privacy. Read the documentation on how to use the new privacy configuration.',
      );
    });
  }

  return allSelectors.join(',');
}

/**
 * Returns privacy related configuration for use in rrweb
 */
export function getPrivacyOptions({
  mask,
  unmask,
  block,
  unblock,
  ignore,

  // eslint-disable-next-line deprecation/deprecation
  blockClass,
  // eslint-disable-next-line deprecation/deprecation
  blockSelector,
  // eslint-disable-next-line deprecation/deprecation
  maskTextClass,
  // eslint-disable-next-line deprecation/deprecation
  maskTextSelector,
  // eslint-disable-next-line deprecation/deprecation
  ignoreClass,
}: GetPrivacyOptions): GetPrivacyReturn {
  const defaultBlockedElements = ['base[href="/"]'];

  const maskSelector = getOption(mask, ['.sentry-mask', '[data-sentry-mask]'], maskTextClass, maskTextSelector);
  const unmaskSelector = getOption(unmask, []);

  const options: GetPrivacyReturn = {
    // We are making the decision to make text and input selectors the same
    maskTextSelector: maskSelector,
    unmaskTextSelector: unmaskSelector,

    blockSelector: getOption(
      block,
      ['.sentry-block', '[data-sentry-block]', ...defaultBlockedElements],
      blockClass,
      blockSelector,
    ),
    unblockSelector: getOption(unblock, []),
    ignoreSelector: getOption(ignore, ['.sentry-ignore', '[data-sentry-ignore]', 'input[type="file"]'], ignoreClass),
  };

  if (blockClass instanceof RegExp) {
    options.blockClass = blockClass;
  }

  if (maskTextClass instanceof RegExp) {
    options.maskTextClass = maskTextClass;
  }

  return options;
}
