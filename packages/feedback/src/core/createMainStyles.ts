import type { FeedbackInternalOptions } from '@sentry/types';
import { DOCUMENT } from '../constants';

function getThemedCssVariables(theme: FeedbackInternalOptions['themeLight']): string {
  return `
  --foreground: ${theme.foreground};
  --success-foreground: ${theme.successForeground};
  --error-foreground: ${theme.errorForeground};
  --background: ${theme.background};
  --border: ${theme.border};
  --box-shadow: ${theme.boxShadow};

  --button-foreground: ${theme.buttonForeground};
  --button-foreground-hover: ${theme.buttonForegroundHover};
  --button-background: ${theme.buttonBackground};
  --button-background-hover: ${theme.buttonBackgroundHover};
  --button-border: ${theme.buttonBorder};
  --button-outline-focus: ${theme.buttonOutlineFocus};

  --trigger-background: ${theme.triggerBackground};
  --trigger-background-hover: ${theme.triggerBackgroundHover};
  --trigger-border-radius: ${theme.triggerBorderRadius};
  `;
}

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createMainStyles({ colorScheme, themeDark, themeLight }: FeedbackInternalOptions): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');
  style.textContent = `
:host {
  --font-family: system-ui, 'Helvetica Neue', Arial, sans-serif;
  --font-size: 14px;
  --z-index: 100000;

  --page-margin: 16px;
  --inset: auto 0 0 auto;
  --actor-inset: var(--inset);

  font-family: var(--font-family);
  font-size: var(--font-size);

  ${getThemedCssVariables(colorScheme === 'dark' ? themeDark : themeLight)}
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    ${getThemedCssVariables(themeDark)}
  }
}`
    : ''
}
}
`;

  return style;
}
