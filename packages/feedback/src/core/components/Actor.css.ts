import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createActorStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');
  style.textContent = `
.widget__actor {
  position: fixed;
  z-index: var(--z-index);
  margin: var(--page-margin);
  inset: var(--actor-inset);

  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;

  font-family: inherit;
  font-size: var(--font-size);
  font-weight: 600;
  line-height: 1.14em;
  text-decoration: none;

  background-color: var(--trigger-background);
  border-radius: var(--trigger-border-radius);
  border: var(--border);
  box-shadow: var(--box-shadow);
  color: var(--foreground);
  cursor: pointer;
  opacity: 1;
  transition: transform 0.2s ease-in-out;
  transform: translate(0, 0) scale(1);
}
.widget__actor[aria-hidden="true"] {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translate(0, 16px) scale(0.98);
}

.widget__actor:hover {
  background-color: var(--trigger-background-hover);
}

.widget__actor svg {
  width: 1.14em;
  height: 1.14em;
}

@media (max-width: 600px) {
  .widget__actor span {
    display: none;
  }
}
`;

  return style;
}
