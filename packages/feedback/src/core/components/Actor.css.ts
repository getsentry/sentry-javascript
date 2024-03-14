import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget actor (button that opens the dialog)
 */
export function createActorStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');
  style.textContent = `
.widget__actor {
  position: fixed;
  left: var(--left);
  right: var(--right);
  bottom: var(--bottom);
  top: var(--top);
  z-index: var(--z-index);

  line-height: 25px;

  display: flex;
  align-items: center;
  gap: 8px;


  border-radius: var(--border-radius);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 12px 16px;
  text-decoration: none;
  z-index: 9000;

  color: var(--foreground);
  background-color: var(--background);
  border: var(--border);
  box-shadow: var(--box-shadow);
  opacity: 1;
  transition: opacity 0.1s ease-in-out;
}

.widget__actor:hover {
  background-color: var(--background-hover);
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
  fill: var(--foreground);
}
`;

  return style;
}
