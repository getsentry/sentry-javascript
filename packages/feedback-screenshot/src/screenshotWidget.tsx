import type { VNode } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { GLOBAL_OBJ } from '@sentry/utils';
import { h } from 'preact';

// exporting a separate copy of `WINDOW` rather than exporting the one from `@sentry/browser`
// prevents the browser package from being bundled in the CDN bundle, and avoids a
// circular dependency between the browser and feedback packages
export const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

type Props = {
  screenshotImage: HTMLCanvasElement | null;
  setScreenshotImage: (screenshot: HTMLCanvasElement | null) => void;
};

interface Point {
  x: number;
  y: number;
}

export interface Rect {
  height: number;
  width: number;
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

export function ScreenshotWidget({ screenshotImage, setScreenshotImage }: Props): VNode | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRatio = useRef<number>(1);
  const [rectStart, setRectStart] = useState({ x: 0, y: 0 });
  const [rectEnd, setRectEnd] = useState({ x: 0, y: 0 });
  const [confirmCrop, setConfirmCrop] = useState(false);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const imageRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLCanvasElement | null>(screenshotImage);

  useEffect(() => {
    const imageCanvas = imageRef.current;
    const ctx = imageCanvas?.getContext('2d');
    const img = new Image();

    if (image) {
      img.src = image.toDataURL();
      const renderSize = getCanvasRenderSize(image.width, image.height);

      img.onload = () => {
        if (imageCanvas && ctx) {
          imageCanvas.width = img.width;
          imageCanvas.height = img.height;
          setCanvasSize(imageCanvas);
          ctx.drawImage(img, 0, 0);
        }
      };

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = renderSize.width;
        canvas.height = renderSize.height;
        setRectStart({ x: 0, y: 0 });
        setCanvasSize(canvas);
      }
    }
  }, [image]);

  function setCanvasSize(canvas: HTMLCanvasElement) {
    if (image) {
      const renderSize = getCanvasRenderSize(image.width, image.height);
      canvas.style.width = `${renderSize.width}px`;
      canvas.style.height = `${renderSize.height}px`;
      canvas.style.top = '0px';
      canvas.style.left = '0px';

      setRectEnd({ x: renderSize.width, y: renderSize.height });
    }
  }

  function refreshCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const rect = constructRect(rectStart, rectEnd);
      setCrop(rect);

      // draw gray overlay around the selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, rect.y);
      ctx.fillRect(0, rect.y, rect.x, rect.height);
      ctx.fillRect(rect.x + rect.width, rect.y, canvas.width, rect.height);
      ctx.fillRect(0, rect.y + rect.height, canvas.width, canvas.height);

      // draw selection border
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 6;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  const handleMouseMove = useCallback((e: { offsetX: number; offsetY: number }) => {
    console.log('move');
    setRectStart({
      x: Math.floor(e.offsetX / currentRatio.current),
      y: Math.floor(e.offsetY / currentRatio.current),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    console.log('up');
    canvasRef.current?.removeEventListener('mousemove', handleMouseMove);
    canvasRef.current?.removeEventListener('click', handleMouseUp);
    setConfirmCrop(true);
  }, []);

  function onGrabButton() {
    console.log('down');
    setConfirmCrop(false);
    canvasRef.current?.addEventListener('click', handleMouseUp);
    canvasRef.current?.addEventListener('mousemove', handleMouseMove);
  }

  useEffect(() => {
    refreshCanvas();
  }, [rectStart, rectEnd]);

  function submit(rect?: Rect) {
    const canvas = imageRef.current;
    if (!rect) {
      setScreenshotImage(canvas);
      setImage(canvas);
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
    setImage(cutoutCanvas);
  }

  return (
    <div style="padding-right: 16px; position:relative;">
      <canvas ref={imageRef}></canvas>
      <canvas style={{ position: 'absolute' }} ref={canvasRef}></canvas>
      <button
        style={{ width: '32px', position: 'absolute', left: rectStart.x, top: rectStart.y }}
        onMouseDown={e => {
          e.preventDefault();
          onGrabButton();
        }}
        onClick={e => {
          e.preventDefault();
          handleMouseUp();
        }}
      ></button>
      <button style={{ position: 'absolute', left: rectStart.x, top: rectEnd.y }}></button>
      <button style={{ position: 'absolute', left: rectEnd.x, top: rectStart.y }}></button>
      <button style={{ position: 'absolute', left: rectEnd.x, top: rectEnd.y }}></button>
      <div
        style={{
          position: 'absolute',
          left: rectEnd.x,
          top: rectEnd.y,
          display: confirmCrop ? 'inline' : 'none',
        }}
      >
        <button
          onClick={e => {
            e.preventDefault();
            setRectStart({ x: 0, y: 0 });
            setConfirmCrop(false);
          }}
        >
          Cancel
        </button>
        <button
          style={{
            background: 'purple',
          }}
          onClick={e => {
            e.preventDefault();
            submit(crop);
            setConfirmCrop(false);
          }}
        >
          Submit
        </button>
      </div>
    </div>
  );
}
