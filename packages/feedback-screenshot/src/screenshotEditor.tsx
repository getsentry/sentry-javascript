/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { h, render } from 'preact';
import type { VNode } from 'preact';
import { ScreenshotEditorHelp } from './screenshotEditorHelp';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GLOBAL_OBJ } from '@sentry/utils';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

type Props = {
  screenshotImage: HTMLCanvasElement | null;
  setScreenshotImage: (screenshot: HTMLCanvasElement | null) => void;
};
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
export function ScreenshotWidget({ screenshotImage, setScreenshotImage }: Props): VNode | null {
  // const image = screenshotImage;
  // return image ? (
  //   <div style="padding-right: 16px;">
  //     <img
  //       type="image"
  //       src={image.toDataURL()}
  //       id="screenshot"
  //       name="screenshot"
  //       style="width:100%; height:100%;"
  //     ></img>
  //   </div>
  // ) : null;

  // const Canvas = styled.canvas`
  //   position: absolute;
  //   cursor: crosshair;
  //   max-width: 100vw;
  //   max-height: 100vh;
  // `;
  // const Container = styled.div`
  //   position: fixed;
  //   z-index: 10000;
  //   height: 100vh;
  //   width: 100vw;
  //   top: 0;
  //   left: 0;
  //   background-color: rgba(240, 236, 243, 1);
  //   background-image: repeating-linear-gradient(
  //     45deg,
  //     transparent,
  //     transparent 5px,
  //     rgba(0, 0, 0, 0.03) 5px,
  //     rgba(0, 0, 0, 0.03) 10px
  //   );
  // `;

  const getCanvasRenderSize = (width: number, height: number) => {
    const maxWidth = WINDOW.innerWidth;
    const maxHeight = WINDOW.innerHeight;

    if (width > maxWidth) {
      height = (maxWidth / width) * height;
      width = maxWidth;
    }

    if (height > maxHeight) {
      width = (maxHeight / height) * width;
      height = maxHeight;
    }

    return { width, height };
  };

  interface Point {
    x: number;
    y: number;
  }

  const constructRect = (start: Point, end: Point) => {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(start.x - end.x),
      height: Math.abs(start.y - end.y),
    };
  };

  const canvasRef = useRef<HTMLCanvasElement>(screenshotImage);
  const [isDraggingState, setIsDraggingState] = useState(true);
  const currentRatio = useRef<number>(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    // eslint-disable-next-line @sentry-internal/sdk/no-optional-chaining
    const ctx = canvas?.getContext('2d');
    let img = new Image();
    const rectStart: { x: number; y: number } = { x: 0, y: 0 };
    const rectEnd: { x: number; y: number } = { x: canvas?.width ?? 0, y: canvas?.height ?? 0 };
    let isDragging = false;

    function setCanvasSize() {
      const renderSize = getCanvasRenderSize(img.width, img.height);
      if (canvas) {
        canvas.style.width = `${renderSize.width}px`;
        canvas.style.height = `${renderSize.height}px`;
        canvas.style.top = `${(WINDOW.innerHeight - renderSize.height) / 2}px`;
        canvas.style.left = `${(WINDOW.innerWidth - renderSize.width) / 2}px`;
        console.log(WINDOW.innerWidth, WINDOW.innerHeight, renderSize.width, renderSize.height);
      }

      // store it so we can translate the selection
      currentRatio.current = renderSize.width / img.width;
    }

    function refreshCanvas() {
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      }

      if (!isDragging) {
        return;
      }

      const rect = constructRect(rectStart, rectEnd);
      if (canvas && ctx) {
        // draw gray overlay around the selection
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, rect.y);
        ctx.fillRect(0, rect.y, rect.x, rect.height);
        ctx.fillRect(rect.x + rect.width, rect.y, canvas.width, rect.height);
        ctx.fillRect(0, rect.y + rect.height, canvas.width, canvas.height);

        // draw selection border
        ctx.strokeStyle = '#79628c';
        ctx.lineWidth = 6;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }

    function submit(rect?: Rect) {
      if (!rect) {
        setScreenshotImage(canvas);
        return;
      }
      // eslint-disable-next-line no-restricted-globals
      const cutoutCanvas = document.createElement('canvas');
      cutoutCanvas.width = rect.width;
      cutoutCanvas.height = rect.height;
      const cutoutCtx = cutoutCanvas.getContext('2d');
      if (cutoutCtx && canvas) {
        cutoutCtx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
      }

      setScreenshotImage(cutoutCanvas);
      img.src = cutoutCanvas.toDataURL();
    }

    function handleMouseDown(e: { offsetX: number; offsetY: number }) {
      rectStart.x = Math.floor(e.offsetX / currentRatio.current);
      rectStart.y = Math.floor(e.offsetY / currentRatio.current);
      isDragging = true;
      setIsDraggingState(true);
    }

    function handleMouseMove(e: { offsetX: number; offsetY: number }) {
      rectEnd.x = Math.floor(e.offsetX / currentRatio.current);
      rectEnd.y = Math.floor(e.offsetY / currentRatio.current);
      refreshCanvas();
    }

    async function handleMouseUp() {
      isDragging = false;
      setIsDraggingState(false);
      if (rectStart.x - rectEnd.x === 0 && rectStart.y - rectEnd.y === 0) {
        // no selection
        refreshCanvas();
        return;
      }
      await submit(constructRect(rectStart, rectEnd));
    }

    async function handleEnterKey(e: { key: string }) {
      if (e.key === 'Enter') {
        await submit();
      }
    }

    img.onload = () => {
      if (canvas && ctx) {
        canvas.width = img.width;
        canvas.height = img.height;
        setCanvasSize();
        ctx.drawImage(img, 0, 0);
      }
    };

    if (screenshotImage) {
      img.src = screenshotImage.toDataURL();
    }

    WINDOW.addEventListener('resize', setCanvasSize, { passive: true });
    canvas?.addEventListener('mousedown', handleMouseDown);
    canvas?.addEventListener('mousemove', handleMouseMove);
    canvas?.addEventListener('mouseup', handleMouseUp);
    WINDOW.addEventListener('keydown', handleEnterKey);

    return () => {
      WINDOW.removeEventListener('resize', setCanvasSize);
      canvas?.removeEventListener('mousedown', handleMouseDown);
      canvas?.removeEventListener('mousemove', handleMouseMove);
      canvas?.removeEventListener('mouseup', handleMouseUp);
      WINDOW.removeEventListener('keydown', handleEnterKey);
    };
  }, [screenshotImage]);

  return (
    <div style="padding-right: 16px;">
      <canvas
        style="
    width: 100%;
    height: 100%;"
        ref={canvasRef}
      />
      {/* <ScreenshotEditorHelp hide={isDraggingState} /> */}
    </div>
  );
}
