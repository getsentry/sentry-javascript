import type { FeedbackInternalOptions } from '@sentry/types';
import { DOCUMENT } from '../../constants';

const DIALOG = `
.dialog {
  position: fixed;
  z-index: var(--z-index);
  margin: 0;

  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  height: 100vh;
  width: 100vw;

  line-height: 1.75em;

  background-color: rgba(0, 0, 0, 0.05);
  border: none;
  inset: 0;
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
  inset: var(--dialog-inset);

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: var(--dialog-padding);
  max-width: 100%;
  max-height: calc(100% - (2 * var(--page-margin)) - (2 * var(--dialog-padding)));
  overflow: auto;

  background-color: var(--background);
  border-radius: var(--form-border-radius);
  border: var(--border);
  box-shadow: var(--box-shadow);
  color: var(--foreground);
  transform: translate(0, 0) scale(1);
  transition: transform 0.2s ease-in-out;
}

.dialog__content:has(.editor) {
  inset: var(--page-margin);
}
@media (max-width: 600px) {
  .dialog__content {
    inset: var(--page-margin);
  }
}
`;

const DIALOG_HEADER = `
.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin: 0;
}

.brand-link {
  display: inline-flex;
}
`;

const FORM = `
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
  gap: 20px;
  flex: 1 0 auto;
}

@media (max-width: 600px) {
  .form__right {
    width: auto;
  }
}

.form__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  display: flex;
  gap: 4px;
  align-items: center;
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

.error {
  color: var(--error);
}
`;

const BUTTON = `
.btn-group {
  display: grid;
  gap: 8px;
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
`;

const SUCCESS = `
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
`;

function getThemedCssVariables(theme: FeedbackInternalOptions['themeLight']): string {
  return `
  --submit-background: ${theme.submitBackground};
  --submit-background-hover: ${theme.submitBackgroundHover};
  --submit-border: ${theme.submitBorder};
  --submit-outline-focus: ${theme.submitOutlineFocus};
  --submit-foreground: ${theme.submitForeground};
  --submit-foreground-hover: ${theme.submitForegroundHover};

  --cancel-background: ${theme.cancelBackground};
  --cancel-background-hover: ${theme.cancelBackgroundHover};
  --cancel-border: ${theme.cancelBorder};
  --cancel-outline-focus: ${theme.cancelOutlineFocus};
  --cancel-foreground: ${theme.cancelForeground};
  --cancel-foreground-hover: ${theme.cancelForegroundHover};

  --input-background: ${theme.inputBackground};
  --input-foreground: ${theme.inputForeground};
  --input-border: ${theme.inputBorder};
  --input-outline-focus: ${theme.inputOutlineFocus};

  --form-border-radius: ${theme.formBorderRadius};
  --form-content-border-radius: ${theme.formContentBorderRadius};
  `;
}

/**
 * Creates <style> element for widget dialog
 */
export function createDialogStyles({ colorScheme, themeDark, themeLight }: FeedbackInternalOptions): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  style.textContent = `
:host {
  --dialog-inset: auto var(--page-margin) var(--page-margin) auto;
  --dialog-padding: 24px;

  ${getThemedCssVariables(colorScheme === 'dark' ? themeDark : themeLight)}
}

${
  colorScheme === 'system'
    ? `
@media (prefers-color-scheme: dark) {
  :host {
    ${getThemedCssVariables(themeDark)}
  }
}`
    : ''
}
}

${DIALOG}
${DIALOG_HEADER}
${FORM}
${BUTTON}
${SUCCESS}
`;

  return style;
}
