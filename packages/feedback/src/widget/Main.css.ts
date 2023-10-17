import type { FeedbackTheme } from '../types';

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createMainStyles(d: Document, theme: FeedbackTheme): HTMLStyleElement {
  const style = d.createElement('style');
  style.textContent = `
:host {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  --bg-color: ${theme.light.background};
  --bg-hover-color: #f6f6f7;
  --fg-color: ${theme.light.foreground};
  --error-color: #df3338;
  --success-color: #268d75;
  --border: 1.5px solid rgba(41, 35, 47, 0.13);
  --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
}

.__dark-mode:host {
  --bg-color: ${theme.dark.background};
  --bg-hover-color: #352f3b;
  --fg-color: ${theme.dark.foreground};
  --error-color: #f55459;
  --success-color: #2da98c;
  --border: 1.5px solid rgba(235, 230, 239, 0.15);
  --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
}
`;

  return style;
}
