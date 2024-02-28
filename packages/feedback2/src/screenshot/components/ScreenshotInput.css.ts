import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createScreenshotInputStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  style.textContent = `
.dialog__content:has(.editor) {
  top: var(--bottom);
  left: var(--right);
}

.editor {
  background: red;
  flex: 1 0 auto;
}

.editor .image {
  width: 100%;
  height: 100%;
}
`;

  return style;
}
