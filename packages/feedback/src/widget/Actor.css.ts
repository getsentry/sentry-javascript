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
