import type { FeedbackInternalOptions } from '@sentry/types';
import { DOCUMENT } from '../constants';

function getThemedCssVariables(theme: FeedbackInternalOptions['themeLight']): string {
  return `
  --background: ${theme.background};
  --background-hover: ${theme.backgroundHover};
  --foreground: ${theme.foreground};
  --error: ${theme.error};
  --success: ${theme.success};
  --border: ${theme.border};
  --border-radius: ${theme.borderRadius};
  --box-shadow: ${theme.boxShadow};
  `;
}

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createMainStyles({ colorScheme, themeDark, themeLight }: FeedbackInternalOptions): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');
  style.textContent = `
:host {
  --z-index: ${themeLight.zIndex};
  --font-family: ${themeLight.fontFamily};
  --font-size: ${themeLight.fontSize};

  font-family: var(--font-family);
  font-size: var(--font-size);

  --page-margin: 16px;
  --actor-inset: auto var(--page-margin) var(--page-margin) auto;

  .brand-link path {
    fill: ${colorScheme === 'dark' ? '#fff' : '#362d59'};
  }
  @media (prefers-color-scheme: dark)
  {
    path: {
      fill: '#fff';
    }
  }

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
