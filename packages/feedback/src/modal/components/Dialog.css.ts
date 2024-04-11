import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createDialogStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  style.textContent = `
.dialog {
  line-height: 25px;
  background-color: rgba(0, 0, 0, 0.05);
  border: none;
  position: fixed;
  inset: 0;
  z-index: 10000;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity 0.2s ease-in-out;
}

.dialog:not([open]) {
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}
.dialog:not([open]) .dialog__content {
  transform: translate(0, -16px) scale(0.98);
}

.dialog__content {
  position: fixed;
  left: var(--left);
  right: var(--right);
  bottom: var(--bottom);
  top: var(--top);

  border: var(--border);
  border-radius: var(--form-border-radius);
  background-color: var(--background);
  color: var(--foreground);

  max-width: 100%;
  max-height: calc(100% - 2rem);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--box-shadow);
  transition: transform 0.2s ease-in-out;
  transform: translate(0, 0) scale(1);

  padding: 24px;
}
.dialog__content-fullscreen {
  top: 16px;
  left: 16px;
}

.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 20px;
  font-weight: 600;
  margin: 0;

}

.brand-link {
  display: inline-flex;
}

.error {
  color: var(--error);
}

.form {
  display: flex;
  overflow: auto;
  flex-direction: row;
  gap: 16px;
  flex: 1 0;
}

.form__right {
  width: 272px;
  display: flex;
  overflow: auto;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
}


.form__error-container {
  color: var(--error);
}

.form__label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0px;
}

.form__label__text {
  display: grid;
  gap: 4px;
  align-items: center;
  grid-auto-flow: column;
  grid-auto-columns: max-content;
}

.form__label__text--required {
  font-size: 0.85em;
}

.form__input {
  font-family: inherit;
  line-height: inherit;
  background-color: var(--input-background);
  box-sizing: border-box;
  border: var(--input-border);
  border-radius: var(--form-content-border-radius);
  color: var(--input-foreground);
  font-size: var(--font-size);
  font-weight: 500;
  padding: 6px 12px;
}

.form__input::placeholder {
  color: var(--input-foreground);
  opacity: 0.65;
}

.form__input:focus-visible {
  outline: 1px auto var(--input-outline-focus);
}

.form__input--textarea {
  font-family: inherit;
  resize: vertical;
}

.btn-group {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.btn {
  line-height: inherit;
  border: var(--cancel-border);
  border-radius: var(--form-content-border-radius);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size);
  font-weight: 600;
  padding: 6px 16px;
}
.btn[disabled] {
  opacity: 0.6;
  pointer-events: none;
}

.btn--primary {
  background-color: var(--submit-background);
  border-color: var(--submit-border);
  color: var(--submit-foreground);
}
.btn--primary:hover {
  background-color: var(--submit-background-hover);
  color: var(--submit-foreground-hover);
}
.btn--primary:focus-visible {
  outline: 1px auto var(--submit-outline-focus);
}

.btn--default {
  background-color: var(--cancel-background);
  color: var(--cancel-foreground);
  font-weight: 500;
}
.btn--default:hover {
  background-color: var(--cancel-background-hover);
  color: var(--cancel-foreground-hover);
}
.btn--default:focus-visible {
  outline: 1px auto var(--cancel-outline-focus);
}

.success-message {
  position: fixed;
  left: var(--left);
  right: var(--right);
  bottom: var(--bottom);
  top: var(--top);
  z-index: var(--z-index);

  background-color: var(--background);
  border: var(--border);
  border-radius: var(--border-radius);
  box-shadow: var(--box-shadow);
  font-weight: 600;
  color: var(--success);
  padding: 12px 24px;
  line-height: 25px;
  display: grid;
  align-items: center;
  grid-auto-flow: column;
  gap: 6px;
  cursor: default;
}

.success-icon {
  display: flex;
}

.success-icon path {
  fill: var(--success);
}
`;

  return style;
}
