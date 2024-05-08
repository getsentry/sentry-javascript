import type { FeedbackInternalOptions } from '@sentry/types';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import { SentryLogo } from './SentryLogo';

export interface Props {
  options: FeedbackInternalOptions;
}

export function DialogHeader({ options }: Props): VNode {
  const logoHtml = useMemo(() => ({ __html: SentryLogo().outerHTML }), []);

  return (
    <h2 class="dialog__header">
      {options.formTitle}
      {options.showBranding ? (
        <a
          class="brand-link"
          target="_blank"
          href="https://sentry.io/welcome/"
          title="Powered by Sentry"
          rel="noopener noreferrer"
          dangerouslySetInnerHTML={logoHtml}
        />
      ) : null}
    </h2>
  );
}
