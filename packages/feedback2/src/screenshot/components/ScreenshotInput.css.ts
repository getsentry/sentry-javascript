import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createScreenshotInputStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  style.textContent = `
.editor {
  background: red;
  width: 75px;
  height: 75px;
}
`;

  return style;
}
