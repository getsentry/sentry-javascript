import type { FeedbackTheme, FeedbackThemes } from '../types';

function getThemedCssVariables(theme: FeedbackTheme): string {
  return `
  --background: ${theme.background};
  --background-hover: ${theme.backgroundHover};
  --foreground: ${theme.foreground};
  --error: ${theme.error};
  --success: ${theme.success};
  --border: ${theme.border};
  --box-shadow: ${theme.boxShadow};

  --submit-background: ${theme.submitBackground};
  --submit-background-hover: ${theme.submitBackgroundHover};
  --submit-border: ${theme.submitBorder};
  --submit-foreground: ${theme.submitForeground};

  --cancel-background: ${theme.cancelBackground};
  --cancel-background-hover: ${theme.cancelBackgroundHover};
  --cancel-border: ${theme.cancelBorder};
  --cancel-foreground: ${theme.cancelForeground};

  --input-background: ${theme.inputBackground};
  --input-foreground: ${theme.inputForeground};
  --input-border: ${theme.inputBorder};
  --input-border-focus: ${theme.inputBorderFocus};
  `;
}

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createMainStyles(
  d: Document,
  colorScheme: 'system' | 'dark' | 'light',
  themes: FeedbackThemes,
): HTMLStyleElement {
  const style = d.createElement('style');
  style.textContent = `
:host {
  --bottom: 1rem;
  --right: 1rem;
  --top: auto;
  --left: auto;
  --z-index: 100000;
  --font-family: ${themes.light.fontFamily};
  --font-size: ${themes.light.fontSize};

  position: fixed;
  left: var(--left);
  right: var(--right);
  bottom: var(--bottom);
  top: var(--top);
  z-index: var(--z-index);

  font-family: var(--font-family);
  font-size: var(--font-size);

  ${getThemedCssVariables(colorScheme === 'dark' ? themes.dark : themes.light)}
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    ${getThemedCssVariables(themes.dark)}
  }
}` : ''}
}`;

  return style;
}
