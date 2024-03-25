import { DOCUMENT } from '../../constants';

/**
 * Creates <style> element for widget dialog
 */
export function createScreenshotAnnotateStyles(): HTMLStyleElement {
  const style = DOCUMENT.createElement('style');

  const surface200 = '#FAF9FB';
  const gray100 = '#F0ECF3';

  style.textContent = `
  .canvas {
    cursor: crosshair;
    max-width: 100%;
    max-height: 100%;
  }

  .container {
    position: fixed;
    z-index: 10000;
    height: 100%;
    width: 100%;
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

  .canvasWrapper {
    position: relative;
    width: 100%;
    margin-top: 32px;
    height: calc(100% - 96px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbarGroup {
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

  .toolbar {
    position: absolute;
    width: 100%;
    bottom: 0px;
    padding: 12px 16px;
    display: flex;
    gap: 12px;
    flex-direction: row;
    justify-content: center;
  }

  .flexSpacer {
    flex: 1;
  }

  .toolButton {
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
    &:active {
      background-color: rgba(108, 95, 199, 1) !important;
      color: white;
    }
  }

  .cancelButton {
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

  .submitButton {
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

  .colorInput {
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

  .colorDisplay {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background-color: var(--annotateColor);
  }
`;

  return style;
}
