/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createActorStyles(d: Document): HTMLStyleElement {
  const style = d.createElement('style');
  style.textContent = `
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

  color: var(--foreground-color);
  background-color: var(--background-color);
  border: var(--border);
  box-shadow: var(--box-shadow);
  opacity: 1;
  transition: opacity 0.1s ease-in-out;
}

.widget__actor:hover {
  background-color: var(--background-hover-color);
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

.feedback-icon path {
  fill: var(--foreground-color);
}
`;

  return style;
}
