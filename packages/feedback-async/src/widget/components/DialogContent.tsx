import { h } from 'preact';
import type { VNode } from 'preact';
import { useMemo } from 'preact/hooks';

import { Form } from './Form';
import type { Props as FormProps } from './Form';
import type { Props as LogoProps } from './Logo';
import { Logo } from './Logo';

export interface Props extends FormProps, LogoProps {
  formTitle: string;
  showBranding: boolean;
}

export function DialogContent({ colorScheme, formTitle, showBranding, ...props }: Props): VNode {
  const logoHtml = useMemo(() => {
    const logo = Logo({ colorScheme });
    return { __html: logo.outerHTML };
  }, [colorScheme]);

  return (
    <div
      class="dialog__content"
      onClick={e => {
        // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
        e.stopPropagation();
      }}
    >
      <h2 class="dialog__header">
        {formTitle}
        {showBranding ? (
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
      <Form {...props} />
    </div>
  );
}
