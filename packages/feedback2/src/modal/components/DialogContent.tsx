// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { ComponentChildren, VNode } from 'preact';
import { useMemo } from 'preact/hooks';
import { Form } from './Form';
import type { Props as FormProps } from './Form';
import type { Props as LogoProps } from './SentryLogo';
import { SentryLogo } from './SentryLogo';

export interface Props extends FormProps, LogoProps {
  children?: ComponentChildren;
  formTitle: string;
  showBranding: boolean;
}

export function DialogContent({ children, colorScheme, formTitle, showBranding, ...props }: Props): VNode {
  const logoHtml = useMemo(() => {
    const logo = SentryLogo({ colorScheme });
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
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
        {children}
        <Form {...props} />
      </div>
    </div>
  );
}
