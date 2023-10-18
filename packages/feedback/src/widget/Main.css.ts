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

  --bg-color: ${themes.light.background};
  --bg-hover-color: ${themes.light.backgroundHover};
  --fg-color: ${themes.light.foreground};
  --error-color: ${themes.light.error};
  --success-color: ${themes.light.success};
  --border: ${themes.light.border};
  --box-shadow: ${themes.light.boxShadow};
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    --bg-color: ${themes.dark.background};
    --bg-hover-color: ${themes.dark.backgroundHover};
    --fg-color: ${themes.dark.foreground};
    --error-color: ${themes.dark.error};
    --success-color: ${themes.dark.success};
    --border: ${themes.dark.border};
    --box-shadow: ${themes.dark.boxShadow};
    --font-family: ${themes.dark.fontFamily};
    --font-size: ${themes.dark.fontSize};
  }
}
`
    : `
:host-context([data-sentry-feedback-colorscheme="dark"]) {
  --bg-color: ${themes.dark.background};
  --bg-hover-color: ${themes.dark.backgroundHover};
  --fg-color: ${themes.dark.foreground};
  --error-color: ${themes.dark.error};
  --success-color: ${themes.dark.success};
  --border: ${themes.dark.border};
  --box-shadow: ${themes.dark.boxShadow};
  --font-family: ${themes.dark.fontFamily};
  --font-size: ${themes.dark.fontSize};
}
`
}`;

  return style;
}
