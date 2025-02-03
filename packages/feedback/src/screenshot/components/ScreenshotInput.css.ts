import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createScreenshotInputStyles(styleNonce?: string): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  const surface200 = '#1A141F';
  const gray100 = '#302735';

  style.textContent = `
.editor {
  display: flex;
  flex-grow: 1;
  flex-direction: column;
}
.editor__image-container {
  padding: 10px;
  padding-top: 65px;
  padding-bottom: 65px;
  position: relative;
  height: 100%;
  border-radius: var(--menu-border-radius, 6px);

  background-color: ${surface200};
  background-image: repeating-linear-gradient(
      -145deg,
      transparent,
      transparent 8px,
      ${surface200} 8px,
      ${surface200} 11px
    ),
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 15px,
      ${gray100} 15px,
      ${gray100} 16px
    );
}

.editor__annotation {
  z-index: 1;
}
.editor__annotation--active {
  z-index: 2;
}

.editor__canvas-container {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.editor__canvas-container canvas {
  object-fit: contain;
  position: absolute;
}

.editor__crop-container {
  custor: auto;
  position: absolute;
  z-index: 2;
}
.editor__crop-container--inactive {
  z-index: 1;
}
.editor__crop-container--move {
  cursor: move;
}

.editor__crop-btn-group {
  padding: 8px;
  gap: 8px;
  border-radius: var(--menu-border-radius, 6px);
  background: var(--button-background, var(--background));
  width: 175px;
  position: absolute;
  display: none;
}
.editor__crop-btn-group--active {
  display: flex;
}

.editor__crop-corner {
  width: 30px;
  height: 30px;
  position: absolute;
  background: none;
  border: 3px solid #ffffff;
}

.editor__crop-corner--top-left {
  cursor: nwse-resize;
  border-right: none;
  border-bottom: none;
}
.editor__crop-corner--top-right {
  cursor: nesw-resize;
  border-left: none;
  border-bottom: none;
}
.editor__crop-corner--bottom-left {
  cursor: nesw-resize;
  border-right: none;
  border-top: none;
}
.editor__crop-corner--bottom-right {
  cursor: nwse-resize;
  border-left: none;
  border-top: none;
}
.editor__tool-container {
  padding-top: 8px;
  display: flex;
  justify-content: space-between;
}
.editor__tool-bar {
  display: flex;
  gap: 8px;
}
.editor__tool {
  display: flex;
  padding: 8px 12px;
  justify-content: center;
  align-items: center;
  border: var(--button-border, var(--border));
  border-radius: var(--button-border-radius, 6px);
  background: var(--button-background, var(--background));
  color: var(--button-foreground, var(--foreground));
}

.editor__tool--active {
  background: var(--button-primary-background, var(--accent-background));
  color: var(--button-primary-foreground, var(--accent-foreground));
}
`;

  if (styleNonce) {
    style.setAttribute('nonce', styleNonce);
  }

  return style;
}
