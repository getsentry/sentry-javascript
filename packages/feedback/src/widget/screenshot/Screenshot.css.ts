export function createScreenshotStyles(d: Document): HTMLStyleElement {
  const style = d.createElement('style');

  style.textContent = `
.screenshot-editor {
  position: absolute;
  cursor: crosshair;
  max-width: 100vw;
  max-height: 100vh;
}

.screenshot-editor__container {
  position: fixed;
  z-index: 10000;
  height: 100vh;
  width: 100vw;
  top: 0;
  left: 0;
  background-color: rgba(240, 236, 243, 1);
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 5px,
    rgba(0, 0, 0, 0.03) 5px,
    rgba(0, 0, 0, 0.03) 10px
  );
}

.screenshot-editor__help {
  position: fixed;
  width: 100vw;
  padding-top: 8px;
  left: 0;
  pointer-events: none;
  display: flex;
  justify-content: center;
  transition: transform 0.2s ease-in-out;
  transition-delay: 0.5s;
  transform: translateY(0);
  &[data-hide='true'] {
    transition-delay: 0s;
    transform: translateY(-100%);
  }
}

.screenshot-editor__help__content {
  background-color: #231c3d;
  border: 1px solid #ccc;
  border-radius: 20px;
  color: #fff;
  font-size: 14px;
  padding: 6px 24px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), 0 4px 16px rgba(0, 0, 0, 0.2);
}

.image-editor__container {
  position: fixed;
  z-index: 10000;
  height: 100vh;
  width: 100vw;
  top: 0;
  left: 0;
  background-color: rgba(240, 236, 243, 1);
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 5px,
    rgba(0, 0, 0, 0.03) 5px,
    rgba(0, 0, 0, 0.03) 10px
  );
}

.image-editor__canvas {
  cursor: crosshair;
  max-width: 100vw;
  max-height: 100vh;
}

.image-editor__canvas__wrapper {
  position: relative;
  width: 100%;
  margin-top: 32px;
  height: calc(100% - 96px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-editor__toolbar {
  position: absolute;
  width: 100%;
  bottom: 0px;
  padding: 12px 16px;
  display: flex;
  gap: 12px;
  flex-direction: row;
  justify-content: center;
}

.image-editor__toolbar__group {
  display: flex;
  flex-direction: row;
  height: 42px;
  background-color: white;
  border: rgba(58, 17, 95, 0.14) 1px solid;
  border-radius: 10px;
  padding: 4px;
  overflow: hidden;
  gap: 4px;
  box-shadow: 0px 1px 2px 1px rgba(43, 34, 51, 0.04);
}

.image-editor__tool-button {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  background-color: white;
  color: rgba(43, 34, 51, 1);
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  &:hover {
    background-color: rgba(43, 34, 51, 0.06);
  }
}

.image-editor__tool-button--active {
  background-color: rgba(108, 95, 199, 1) !important;
  color: white;
}

.image-editor__tool-icon {

}

.image-editor__spacer {
  flex: 1;
}

.image-editor__cancel {
  height: 40px;
  width: 84px;
  border: rgba(58, 17, 95, 0.14) 1px solid;
  background-color: #fff;
  color: rgba(43, 34, 51, 1);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 10px;
  &:hover {
    background-color: #eee;
  }

}

.image-editor__submit {
  height: 40px;
  width: 84px;
  border: none;
  background-color: rgba(108, 95, 199, 1);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 10px;
  &:hover {
    background-color: rgba(88, 74, 192, 1);
  }

}

.image-editor__color-display {
  width: 16px;
  height: 16px;
  border-radius: 4px;

}
.image-editor__color-input {
  position: relative;
  display: flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  margin: 0;
  cursor: pointer;
  & input[type='color'] {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0;
    width: 0;
    height: 0;
  }
}
`;

  return style;
}
