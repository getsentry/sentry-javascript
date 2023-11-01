import type { FeedbackThemes } from '../types';

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

  --background-color: ${themes.light.background};
  --background-hover-color: ${themes.light.backgroundHover};
  --foreground-color: ${themes.light.foreground};
  --error-color: ${themes.light.error};
  --success-color: ${themes.light.success};
  --border: ${themes.light.border};
  --box-shadow: ${themes.light.boxShadow};

  --submit-button-background: ${themes.light.submitButtonBackground};
  --submit-button-background-hover: ${themes.light.submitButtonBackgroundHover};
  --submit-button-border: ${themes.light.submitButtonBorder};
  --submit-button-foreground: ${themes.light.submitButtonForeground};

  --cancel-button-background: ${themes.light.cancelButtonBackground};
  --cancel-button-background-hover: ${themes.light.cancelButtonBackgroundHover};
  --cancel-button-border: ${themes.light.cancelButtonBorder};
  --cancel-button-foreground: ${themes.light.cancelButtonForeground};
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    --background-color: ${themes.dark.background};
    --background-hover-color: ${themes.dark.backgroundHover};
    --foreground-color: ${themes.dark.foreground};
    --error-color: ${themes.dark.error};
    --success-color: ${themes.dark.success};
    --border: ${themes.dark.border};
    --box-shadow: ${themes.dark.boxShadow};
    --font-family: ${themes.dark.fontFamily};
    --font-size: ${themes.dark.fontSize};

    --submit-button-background: ${themes.dark.submitButtonBackground};
    --submit-button-background-hover: ${themes.dark.submitButtonBackgroundHover};
    --submit-button-border: ${themes.dark.submitButtonBorder};
    --submit-button-foreground: ${themes.dark.submitButtonForeground};

    --cancel-button-background: ${themes.dark.cancelButtonBackground};
    --cancel-button-background-hover: ${themes.dark.cancelButtonBackgroundHover};
    --cancel-button-border: ${themes.dark.cancelButtonBorder};
    --cancel-button-foreground: ${themes.dark.cancelButtonForeground};
  }
}
`
    : `
:host-context([data-sentry-feedback-colorscheme="dark"]) {
  --background-color: ${themes.dark.background};
  --background-hover-color: ${themes.dark.backgroundHover};
  --foreground-color: ${themes.dark.foreground};
  --error-color: ${themes.dark.error};
  --success-color: ${themes.dark.success};
  --border: ${themes.dark.border};
  --box-shadow: ${themes.dark.boxShadow};
  --font-family: ${themes.dark.fontFamily};
  --font-size: ${themes.dark.fontSize};

  --submit-button-background: ${themes.dark.submitButtonBackground};
  --submit-button-background-hover: ${themes.dark.submitButtonBackgroundHover};
  --submit-button-border: ${themes.dark.submitButtonBorder};
  --submit-button-foreground: ${themes.dark.submitButtonForeground};

  --cancel-button-background: ${themes.dark.cancelButtonBackground};
  --cancel-button-background-hover: ${themes.dark.cancelButtonBackgroundHover};
  --cancel-button-border: ${themes.dark.cancelButtonBorder};
  --cancel-button-foreground: ${themes.dark.cancelButtonForeground};
}
`
}`;

  return style;
}
