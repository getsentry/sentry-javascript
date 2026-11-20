import type { FeedbackInternalOptions } from '@sentry/core';
import type { VNode } from 'preact';
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { SentryLogo } from './SentryLogo';

export interface Props {
  options: FeedbackInternalOptions;
}

export function DialogHeader({ options }: Props): VNode {
  return (
    <h2 class="dialog__header">
      <span class="dialog__title">{options.formTitle}</span>
      {options.showBranding ? (
        <a
          class="brand-link"
          target="_blank"
          href="https://sentry.io/welcome/"
          title="Powered by Sentry"
          rel="noopener noreferrer"
        >
          <SentryLogo />
        </a>
      ) : null}
    </h2>
  );
}
