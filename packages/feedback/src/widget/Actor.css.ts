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

.widget__actor {
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

.widget__actor:hover {
  background-color: var(--bg-hover-color);
}

.widget__actor svg {
  width: 16px;
  height: 16px;
}

.widget__actor--hidden {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.widget__actor__text {
}

.success-message {
  background-color: var(--bg-color);
  border: var(--border);
  border-radius: 12px;
  box-shadow: var(--box-shadow);
  font-weight: 600;
  color: var(--success-color);
  padding: 12px 24px;
  line-height: 25px;
  display: grid;
  align-items: center;
  grid-auto-flow: column;
  gap: 6px;
  cursor: default;

}
`;

  return style;
}
