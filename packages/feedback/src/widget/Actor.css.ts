import type { FeedbackTheme } from '../types';

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createActorStyles(d: Document, theme: FeedbackTheme): HTMLStyleElement {
  const style = d.createElement('style');
  style.textContent = `
:host {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  --bg-color: ${theme.light.background};
  --bg-hover-color: #f6f6f7;
  --fg-color: ${theme.light.foreground};
  --border: 1.5px solid rgba(41, 35, 47, 0.13);
  --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
}

.__sntry_fdbk_dark:host {
  --bg-color: ${theme.dark.background};
  --bg-hover-color: #352f3b;
  --fg-color: ${theme.dark.foreground};
  --border: 1.5px solid rgba(235, 230, 239, 0.15);
  --box-shadow: 0px 4px 24px 0px rgba(43, 34, 51, 0.12);
}

.widget-actor {
  line-height: 25px;

  display: flex;
  align-items: center;
  gap: 8px;

  border-radius: 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 16px;
  text-decoration: none;
  z-index: 9000;

  color: var(--fg-color);
  background-color: var(--bg-color);
  border: var(--border);
  box-shadow: var(--box-shadow);
  opacity: 1;
  transition: opacity 0.1s ease-in-out;
}

.widget-actor:hover {
  background-color: var(--bg-hover-color);
}

.widget-actor svg {
  width: 16px;
  height: 16px;
}

.widget-actor.hidden {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.widget-actor-text {
}
`;

  return style;
}
