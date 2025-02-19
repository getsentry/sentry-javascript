/* eslint-disable max-lines */
import type { ComponentType, VNode, h as hType } from 'preact';
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type * as Hooks from 'preact/hooks';
import { useTakeScreenshotFactory } from './useTakeScreenshot';
import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import { DOCUMENT, WINDOW } from '../../constants';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import ToolbarFactoryv2 from './Toolbarv2';
import IconCloseFactory from './IconClose';

interface FactoryParams {
  h: typeof hType;
  hooks: typeof Hooks;
  imageBuffer: HTMLCanvasElement;
  dialog: ReturnType<FeedbackModalIntegration['createDialog']>;
  options: FeedbackInternalOptions;
}

interface Props {
  onError: (error: Error) => void;
}

interface Box {
  action: 'highlight' | 'hide' | '';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Rect {
  action: 'highlight' | 'hide' | '';
  x: number;
  y: number;
  height: number;
  width: number;
}

const DPI = WINDOW.devicePixelRatio;

const constructRect = (box: Box): Rect => ({
  action: box.action,
  x: Math.min(box.startX, box.endX),
  y: Math.min(box.startY, box.endY),
  width: Math.abs(box.startX - box.endX),
  height: Math.abs(box.startY - box.endY),
});

const getContainedSize = (measurementDiv: HTMLDivElement, imageSource: HTMLCanvasElement): Rect => {
  const imgClientHeight = measurementDiv.clientHeight;
  const imgClientWidth = measurementDiv.clientWidth;
  const ratio = imageSource.width / imageSource.height;
  let width = imgClientHeight * ratio;
  let height = imgClientHeight;
  if (width > imgClientWidth) {
    width = imgClientWidth;
    height = imgClientWidth / ratio;
  }
  const x = (imgClientWidth - width) / 2;
  const y = (imgClientHeight - height) / 2;
  return { action: '', x: x, y: y, width: width, height: height };
};

function drawRect(rect: Rect, ctx: CanvasRenderingContext2D, scale: number = 1): void {
  const scaledX = rect.x * scale;
  const scaledY = rect.y * scale;
  const scaledWidth = rect.width * scale;
  const scaledHeight = rect.height * scale;

  // creates a shadow around
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 50; // Amount of blur for the shadow

  switch (rect.action) {
    case 'highlight':
      // draws a rectangle first so that the shadow is visible before clearing
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);

      break;
    case 'hide':
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      break;
    default:
      break;
  }

  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(scaledX + 1, scaledY + 1, scaledWidth - 2, scaledHeight - 2);
}

function resizeCanvas(canvas: HTMLCanvasElement, imageDimensions: Rect): void {
  canvas.width = imageDimensions.width * DPI;
  canvas.height = imageDimensions.height * DPI;
  canvas.style.width = `${imageDimensions.width}px`;
  canvas.style.height = `${imageDimensions.height}px`;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (ctx) {
    ctx.scale(DPI, DPI);
  }
}

export function ScreenshotEditorFactoryv2({
  h,
  hooks,
  imageBuffer,
  dialog,
  options,
}: FactoryParams): ComponentType<Props> {
  const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
  const Toolbarv2 = ToolbarFactoryv2({ h });
  const IconClose = IconCloseFactory({ h });
  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = hooks.useMemo(() => ({ __html: createScreenshotInputStyles(options.styleNonce).innerText }), []);

    const [action, setAction] = hooks.useState<'highlight' | 'hide' | ''>('');
    const [drawCommands, setDrawCommands] = hooks.useState<Rect[]>([]);
    const [currentRect, setCurrentRect] = hooks.useState<Rect | undefined>(undefined);
    const measurementRef = hooks.useRef<HTMLDivElement>(null);
    const screenshotRef = hooks.useRef<HTMLCanvasElement>(null);
    const graywashRef = hooks.useRef<HTMLCanvasElement>(null);
    const rectDivRef = hooks.useRef<HTMLDivElement>(null);
    const [imageSource, setImageSource] = hooks.useState<HTMLCanvasElement | null>(null);
    const [isShown, setIsShown] = hooks.useState<boolean>(true);
    const [scaleFactor, setScaleFactor] = hooks.useState<number>(1);

    const resize = hooks.useCallback((): void => {
      const screenshotCanvas = screenshotRef.current;
      const graywashCanvas = graywashRef.current;
      const measurementDiv = measurementRef.current;
      if (!screenshotCanvas || !graywashCanvas || !imageSource || !measurementDiv) {
        return;
      }

      const imageDimensions = getContainedSize(measurementDiv, imageSource);

      resizeCanvas(screenshotCanvas, imageDimensions);
      const scale = screenshotCanvas.width / graywashCanvas.width;
      setScaleFactor(scale);
      resizeCanvas(graywashCanvas, imageDimensions);

      const screenshotContext = screenshotCanvas.getContext('2d', { alpha: false });
      if (!screenshotContext) {
        return;
      }

      screenshotContext.drawImage(imageSource, 0, 0, imageDimensions.width, imageDimensions.height);
      drawScene();

      const rectDiv = rectDivRef.current;
      if (!rectDiv) {
        return;
      }
      rectDiv.style.width = `${imageDimensions.width}px`;
      rectDiv.style.height = `${imageDimensions.height}px`;
    }, [imageSource, isShown, drawCommands]);

    hooks.useEffect(() => {
      WINDOW.addEventListener('resize', resize);

      return () => {
        WINDOW.removeEventListener('resize', resize);
      };
    }, [resize]);

    hooks.useEffect(() => {
      const graywashCanvas = graywashRef.current;
      if (graywashCanvas) {
        drawScene();
        drawBuffer();
      }
    }, [drawCommands]);

    hooks.useEffect(() => {
      if (currentRect) {
        drawScene();
      }
    }, [currentRect]);

    hooks.useEffect(() => {
      const scaledCommands = drawCommands.map(rect => {
        return {
          action: rect.action,
          x: rect.x * scaleFactor,
          y: rect.y * scaleFactor,
          width: rect.width * scaleFactor,
          height: rect.height * scaleFactor,
        };
      });

      setDrawCommands(scaledCommands);
    }, [scaleFactor]);

    function drawBuffer(): void {
      const ctx = imageBuffer.getContext('2d', { alpha: false });
      const measurementDiv = measurementRef.current;
      if (!imageBuffer || !ctx || !imageSource || !measurementDiv) {
        return;
      }

      ctx.drawImage(imageSource, 0, 0);

      const grayWashBufferBig = DOCUMENT.createElement('canvas');
      grayWashBufferBig.width = imageBuffer.width;
      grayWashBufferBig.height = imageBuffer.height;

      const grayCtx = grayWashBufferBig.getContext('2d');
      if (!grayCtx) {
        return;
      }

      // applies the graywash if there's any boxes drawn
      if (drawCommands.length || currentRect) {
        grayCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        grayCtx.fillRect(0, 0, imageBuffer.width, imageBuffer.height);
      }

      const scale = imageBuffer.width / measurementDiv.clientWidth;

      drawCommands.forEach(rect => {
        drawRect(rect, grayCtx, scale);
      });
      ctx.drawImage(grayWashBufferBig, 0, 0);
    }

    function drawScene(): void {
      const graywashCanvas = graywashRef.current;
      if (!graywashCanvas) {
        return;
      }

      const ctx = graywashCanvas.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, graywashCanvas.width, graywashCanvas.height);

      // applies the graywash if there's any boxes drawn
      if (drawCommands.length || currentRect) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(0, 0, graywashCanvas.width, graywashCanvas.height);
      }

      drawCommands.forEach(rect => {
        drawRect(rect, ctx);
      });

      if (currentRect) {
        drawRect(currentRect, ctx);
        setCurrentRect(undefined);
      }
    }

    useTakeScreenshot({
      onBeforeScreenshot: hooks.useCallback(() => {
        (dialog.el as HTMLElement).style.display = 'none';
        setIsShown(false);
      }, []),
      onScreenshot: hooks.useCallback((imageSource: HTMLVideoElement) => {
        const bufferCanvas = DOCUMENT.createElement('canvas');
        bufferCanvas.width = imageSource.videoWidth;
        bufferCanvas.height = imageSource.videoHeight;
        bufferCanvas.getContext('2d', { alpha: false })?.drawImage(imageSource, 0, 0);
        setImageSource(bufferCanvas);
        imageBuffer.width = imageSource.videoWidth;
        imageBuffer.height = imageSource.videoHeight;
      }, []),
      onAfterScreenshot: hooks.useCallback(() => {
        (dialog.el as HTMLElement).style.display = 'block';
        setIsShown(true);
      }, []),
      onError: hooks.useCallback(error => {
        (dialog.el as HTMLElement).style.display = 'block';
        setIsShown(true);
        onError(error);
      }, []),
    });

    const onDraw = (e: MouseEvent): void => {
      if (!action) {
        return;
      }

      const graywashCanvas = graywashRef.current;
      if (!graywashCanvas) {
        return;
      }

      const boundingRect = graywashCanvas.getBoundingClientRect();

      const startX = e.clientX - boundingRect.left;
      const startY = e.clientY - boundingRect.top;

      const handleMouseMove = (e: MouseEvent): void => {
        const endX = e.clientX - boundingRect.left;
        const endY = e.clientY - boundingRect.top;

        const rect = constructRect({ action, startX, startY, endX, endY });

        // prevent drawing rect when clicking on the canvas (ie clicking delete)
        if (action && startX != endX && startY != endY) {
          setCurrentRect(rect);
        }
      };

      const handleMouseUp = (e: MouseEvent): void => {
        const endX = Math.max(0, Math.min(e.clientX - boundingRect.left, graywashCanvas.width / DPI));
        const endY = Math.max(0, Math.min(e.clientY - boundingRect.top, graywashCanvas.height / DPI));
        // prevent drawing rect when clicking on the canvas (ie clicking delete)
        if (startX != endX && startY != endY) {
          const rect = constructRect({ action, startX, startY, endX, endY });
          setDrawCommands(prev => [...prev, rect]);
        }

        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const handleDeleteRect = (index: number): void => {
      const updatedRects = [...drawCommands];
      updatedRects.splice(index, 1);
      setDrawCommands(updatedRects);
    };

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={styles} />
        <div class="editor__image-container">
          <div class="editor__canvas-container">
            <div ref={measurementRef} style={{ position: 'absolute', width: '100%', height: '100%' }}></div>
            <canvas style={{ position: 'absolute', zIndex: '1', objectFit: 'contain' }} ref={screenshotRef}></canvas>
            <canvas
              style={{ position: 'absolute', zIndex: '2', objectFit: 'contain' }}
              ref={graywashRef}
              onMouseDown={onDraw}
            ></canvas>
            <div
              ref={rectDivRef}
              style={{ position: 'absolute', zIndex: '2', objectFit: 'contain' }}
              onMouseDown={onDraw}
            >
              {drawCommands.map((rect, index) => (
                <div
                  key={index}
                  class="rect"
                  style={{
                    position: 'absolute',
                    top: `${rect.y}px`,
                    left: `${rect.x}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                    zIndex: 2,
                  }}
                  onMouseDown={onDraw}
                >
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      top: '-12px',
                      right: '-12px',
                      width: '25px',
                      height: '25px',
                      cursor: 'pointer',
                      borderRadius: 999999,
                      padding: 0,
                      placeContent: 'center',
                      zIndex: 3,
                      border: 'none',
                      background: 'none',
                    }}
                    onClick={() => handleDeleteRect(index)}
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Toolbarv2 action={action} setAction={setAction} />
      </div>
    );
  };
}
