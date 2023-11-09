// import React, {ComponentType, useCallback, useEffect, useMemo, useState} from 'react';
// import styled from '@emotion/styled';
//
import { WINDOW } from '@sentry/browser';
import { createElement } from '../util/createElement';
// import { ToolKey, Tools, useImageEditor } from './hooks/useImageEditor';
import { ArrowIcon, HandIcon, IconComponent, PenIcon, RectangleIcon } from './icons';

export type ToolKey = 'arrow' | 'pen' | 'rectangle' | 'hand';
export const Tools: ToolKey[] = ['arrow', 'pen', 'rectangle', 'hand'];
export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface ImageEditorWrapperProps {
  onCancel: () => void;
  onSubmit: (screenshot: Blob) => void;
  src: string;
}

// const ColorDisplay = styled.div<{ color: string }>`
//   ${({ color }) => `background-color: ${color};`}
// `;
//
const iconMap: Record<NonNullable<ToolKey>, () => IconComponent> = {
  arrow: ArrowIcon,
  pen: PenIcon,
  rectangle: RectangleIcon,
  hand: HandIcon,
};

const getCanvasRenderSize = (canvas: HTMLCanvasElement, containerElement: HTMLDivElement) => {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const maxWidth = containerElement.getBoundingClientRect().width;
  const maxHeight = containerElement.getBoundingClientRect().height;
  // fit canvas to window
  let width = canvasWidth;
  let height = canvasHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const windowRatio = maxWidth / maxHeight;

  if (canvasRatio > windowRatio && canvasWidth > maxWidth) {
    height = (maxWidth / canvasWidth) * canvasHeight;
    width = maxWidth;
  }

  if (canvasRatio < windowRatio && canvasHeight > maxHeight) {
    width = (maxHeight / canvasHeight) * canvasWidth;
    height = maxHeight;
  }

  return { width, height };
};

const srcToImage = (src: string): HTMLImageElement => {
  const image = new Image();
  image.src = src;
  return image;
};

function ToolIcon({ tool }: { tool: ToolKey | null }) {
  const Icon = tool ? iconMap[tool] : HandIcon;
  return Icon();
}

export function ImageEditorWrapper({ src, onCancel, onSubmit }: ImageEditorWrapperProps) {
  let selectedColor = '';

  const resizeCanvas = () => {
    if (!canvas) {
      return;
    }
    // fit canvas to window
    const { width, height } = getCanvasRenderSize(canvas, wrapper);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };

  const image = () => srcToImage(src);
  // const { selectedTool, setSelectedTool, selectedColor, setSelectedColor, getBlob } = useImageEditor({
  //   canvas,
  //   image,
  //   onLoad: resizeCanvas,
  // });

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  function handleSubmit(): void {}
  function setSelectedColor(color: string) {}
  function setSelectedTool(tool: string) {}

  const canvas = createElement('canvas', { className: '.image-editor__canvas' });
  const wrapper = createElement('div', { className: 'image-editor__canvas__wrapper' }, canvas);
  const toolbarGroupTools = createElement(
    'div',
    { className: 'image-editor__toolbar__group' },
    Tools.map(tool =>
      createElement(
        'button',
        { className: 'image-editor__tool-button', onClick: () => setSelectedTool(tool) },
        ToolIcon({ tool }).el,
      ),
    ),
  );
  const colorDisplay = createElement('div', {
    className: 'image-editor__color-display',
    style: `background-color: ${selectedColor}`,
  });

  const colorInput = createElement('input', {
    type: 'color',
    value: selectedColor,
    onChange: (e: Event): void => {
      e.target && setSelectedColor((e.target as HTMLInputElement).value);
    },
  });

  const colorInputLabel = createElement(
    'label',
    {
      className: 'iamge-editor__color-input',
    },
    colorDisplay,
    colorInput,
  );
  const toolbarGroupColor = createElement('div', { className: 'image-editor__toolbar__group' }, colorInputLabel);
  const toolbar = createElement(
    'div',
    { className: 'image-editor__canvas__toolbar' },
    createElement('button', { className: 'image-editor__canvas__cancel', onClick: onCancel }, 'Cancel'),
    createElement('div', { className: 'image-editor__spacer' }),
    toolbarGroupTools,
    toolbarGroupColor,
    createElement('div', { className: 'image-editor__spacer' }),
    createElement('button', { className: 'image-editor__canvas__submit', onClick: handleSubmit }, 'Save'),
  );

  const imageEditor = createElement('div', { className: 'image-editor__container' }, wrapper, toolbar);

  return {
    get el() {
      return imageEditor;
    },
    remove() {
      WINDOW.removeEventListener('resize', resizeCanvas);
    },
  };

  // return (
  //   <Container>
  //     <CanvasWrapper ref={wrapperRef}>
  //       <Canvas ref={setCanvas} />
  //     </CanvasWrapper>
  //     <Toolbar>
  //       <CancelButton onClick={() => onCancel()}>Cancel</CancelButton>
  //       <FlexSpacer />
  //       <ToolbarGroup>
  //         {Tools.map(tool => (
  //           <ToolButton key={tool} active={selectedTool === tool} onClick={() => setSelectedTool(tool)}>
  //             <ToolIcon tool={tool} />
  //           </ToolButton>
  //         ))}
  //       </ToolbarGroup>
  //       <ToolbarGroup>
  //         <ColorInput>
  //           <ColorDisplay color={selectedColor} />
  //           <input type="color" value={selectedColor} onChange={e => setSelectedColor(e.target.value)} />
  //         </ColorInput>
  //       </ToolbarGroup>
  //       <FlexSpacer />
  //       <SubmitButton onClick={async () => onSubmit(await getBlob())}>Save</SubmitButton>
  //     </Toolbar>
  //   </Container>
  // );
}
