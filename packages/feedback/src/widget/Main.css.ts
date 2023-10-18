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
  const theme = colorScheme === 'system' ? themes.light : themes[colorScheme];
  style.textContent = `
:host {
  --bottom: 1rem;
  --right: 1rem;
  --top: auto;
  --left: auto;
  --zIndex: 100000;

  position: fixed;
  left: var(--left);
  right: var(--right);
  bottom: var(--bottom);
  top: var(--top);

  z-index: var(--zIndex);

  font-family: ${theme.fontFamily};
  font-size: ${theme.fontSize};
  --bg-color: ${theme.background};
  --bg-hover-color: ${theme.backgroundHover};
  --fg-color: ${theme.foreground};
  --error-color: ${theme.error};
  --success-color: ${theme.success};
  --border: ${theme.border};
  --box-shadow: ${theme.boxShadow};
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
  }
}
`
    : ''
}`;

  return style;
}
