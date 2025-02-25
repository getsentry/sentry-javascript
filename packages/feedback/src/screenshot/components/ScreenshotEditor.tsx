/* eslint-disable max-lines */
import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: need Preact import for JSX
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type * as Hooks from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import IconCloseFactory from './IconClose';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import ToolbarFactory from './Toolbar';
import { useTakeScreenshotFactory } from './useTakeScreenshot';

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

type Action = 'highlight' | 'hide' | '';

interface Box {
  action: Action;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Rect {
  action: Action;
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

function drawRect(rect: Rect, ctx: CanvasRenderingContext2D, color: string, scale: number = 1): void {
  const scaledX = rect.x * scale;
  const scaledY = rect.y * scale;
  const scaledWidth = rect.width * scale;
  const scaledHeight = rect.height * scale;

  switch (rect.action) {
    case 'highlight': {
      // creates a shadow around
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 50;

      // draws a rectangle first so that the shadow is visible before clearing
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);
      ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);

      // Disable shadow after the action is drawn
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      ctx.strokeStyle = color;
      ctx.strokeRect(scaledX + 1, scaledY + 1, scaledWidth - 2, scaledHeight - 2);

      break;
    }
    case 'hide':
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(scaledX, scaledY, scaledWidth, scaledHeight);

      break;
    default:
      break;
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, imageDimensions: Rect): void {
  canvas.width = imageDimensions.width * DPI;
  canvas.height = imageDimensions.height * DPI;
  canvas.style.width = `${imageDimensions.width}px`;
  canvas.style.height = `${imageDimensions.height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(DPI, DPI);
  }
}

export function ScreenshotEditorFactory({
  h,
  hooks,
  imageBuffer,
  dialog,
  options,
}: FactoryParams): ComponentType<Props> {
  const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
  const Toolbar = ToolbarFactory({ h });
  const IconClose = IconCloseFactory({ h });
  const styles = { __html: createScreenshotInputStyles(options.styleNonce).innerText };

  return function ScreenshotEditor({ onError }: Props): VNode {
    // Data for rendering:
    const [action, setAction] = hooks.useState<'highlight' | 'hide' | ''>('');
    const [drawRects, setDrawRects] = hooks.useState<Rect[]>([]);
    const [currentRect, setCurrentRect] = hooks.useState<Rect | undefined>(undefined);

    // Refs to our html components:
    const measurementRef = hooks.useRef<HTMLDivElement>(null);
    const screenshotRef = hooks.useRef<HTMLCanvasElement>(null);
    const annotatingRef = hooks.useRef<HTMLCanvasElement>(null);
    const rectContainerRef = hooks.useRef<HTMLDivElement>(null);

    // The canvas that contains the original screenshot
    const [imageSource, setImageSource] = hooks.useState<HTMLCanvasElement | null>(null);

    // Hide the whole feedback widget when we take the screenshot
    const [displayEditor, setDisplayEditor] = hooks.useState<boolean>(true);

    // The size of our window, relative to the imageSource
    const [scaleFactor, setScaleFactor] = hooks.useState<number>(1);

    const strokeColor = hooks.useMemo((): string => {
      const sentryFeedback = DOCUMENT.getElementById(options.id);
      if (!sentryFeedback) {
        return 'white';
      }
      const computedStyle = getComputedStyle(sentryFeedback);
      return (
        computedStyle.getPropertyValue('--button-primary-background') ||
        computedStyle.getPropertyValue('--accent-background')
      );
    }, [options.id]);

    const resize = hooks.useCallback((): void => {
      if (!displayEditor) {
        return;
      }

      const screenshotCanvas = screenshotRef.current;
      const annotatingCanvas = annotatingRef.current;
      const measurementDiv = measurementRef.current;
      const rectContainer = rectContainerRef.current;
      if (!screenshotCanvas || !annotatingCanvas || !imageSource || !measurementDiv || !rectContainer) {
        return;
      }

      const imageDimensions = getContainedSize(measurementDiv, imageSource);

      resizeCanvas(screenshotCanvas, imageDimensions);
      resizeCanvas(annotatingCanvas, imageDimensions);

      rectContainer.style.width = `${imageDimensions.width}px`;
      rectContainer.style.height = `${imageDimensions.height}px`;

      const scale = annotatingCanvas.clientWidth / imageBuffer.width;
      setScaleFactor(scale);

      const screenshotContext = screenshotCanvas.getContext('2d', { alpha: false });
      if (!screenshotContext) {
        return;
      }
      screenshotContext.drawImage(imageSource, 0, 0, imageDimensions.width, imageDimensions.height);
      drawScene();
    }, [imageSource, drawRects, displayEditor]);

    hooks.useEffect(() => {
      WINDOW.addEventListener('resize', resize);

      return () => {
        WINDOW.removeEventListener('resize', resize);
      };
    }, [resize]);

    hooks.useLayoutEffect(() => {
      resize();
    }, [resize]);

    hooks.useEffect(() => {
      drawScene();
      drawBuffer();
    }, [drawRects]);

    hooks.useEffect(() => {
      if (currentRect) {
        drawScene();
      }
    }, [currentRect]);

    // draws the commands onto the imageBuffer, which is what's sent to Sentry
    const drawBuffer = hooks.useCallback((): void => {
      const ctx = imageBuffer.getContext('2d', { alpha: false });
      const measurementDiv = measurementRef.current;
      if (!imageBuffer || !ctx || !imageSource || !measurementDiv) {
        return;
      }

      ctx.drawImage(imageSource, 0, 0);

      const annotatingBufferBig = DOCUMENT.createElement('canvas');
      annotatingBufferBig.width = imageBuffer.width;
      annotatingBufferBig.height = imageBuffer.height;

      const grayCtx = annotatingBufferBig.getContext('2d');
      if (!grayCtx) {
        return;
      }

      // applies the graywash if there's any boxes drawn
      if (drawRects.length || currentRect) {
        grayCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        grayCtx.fillRect(0, 0, imageBuffer.width, imageBuffer.height);
      }

      grayCtx.lineWidth = 4;
      drawRects.forEach(rect => {
        drawRect(rect, grayCtx, strokeColor);
      });
      ctx.drawImage(annotatingBufferBig, 0, 0);
    }, [drawRects, strokeColor]);

    const drawScene = hooks.useCallback((): void => {
      const annotatingCanvas = annotatingRef.current;
      if (!annotatingCanvas) {
        return;
      }

      const ctx = annotatingCanvas.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, annotatingCanvas.width, annotatingCanvas.height);

      // applies the graywash if there's any boxes drawn
      if (drawRects.length || currentRect) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(0, 0, annotatingCanvas.width, annotatingCanvas.height);
      }

      ctx.lineWidth = 2;
      const scale = annotatingCanvas.clientWidth / imageBuffer.width;
      drawRects.forEach(rect => {
        drawRect(rect, ctx, strokeColor, scale);
      });

      if (currentRect) {
        drawRect(currentRect, ctx, strokeColor);
      }
    }, [drawRects, currentRect, strokeColor]);

    useTakeScreenshot({
      onBeforeScreenshot: hooks.useCallback(() => {
        (dialog.el as HTMLElement).style.display = 'none';
        setDisplayEditor(false);
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
        setDisplayEditor(true);
      }, []),
      onError: hooks.useCallback(error => {
        (dialog.el as HTMLElement).style.display = 'block';
        setDisplayEditor(true);
        onError(error);
      }, []),
    });

    const handleMouseDown = (e: MouseEvent): void => {
      const annotatingCanvas = annotatingRef.current;
      if (!action || !annotatingCanvas) {
        return;
      }

      const boundingRect = annotatingCanvas.getBoundingClientRect();

      const startX = e.clientX - boundingRect.left;
      const startY = e.clientY - boundingRect.top;

      const handleMouseMove = (e: MouseEvent): void => {
        const endX = e.clientX - boundingRect.left;
        const endY = e.clientY - boundingRect.top;
        const rect = constructRect({ action, startX, startY, endX, endY });
        // prevent drawing when just clicking (not dragging) on the canvas
        if (startX != endX && startY != endY) {
          setCurrentRect(rect);
        }
      };

      const handleMouseUp = (e: MouseEvent): void => {
        // no rect is being drawn anymore, so setting active rect to undefined
        setCurrentRect(undefined);
        const endX = Math.max(0, Math.min(e.clientX - boundingRect.left, annotatingCanvas.width / DPI));
        const endY = Math.max(0, Math.min(e.clientY - boundingRect.top, annotatingCanvas.height / DPI));
        // prevent drawing a rect when just clicking (not dragging) on the canvas (ie. clicking delete)
        if (startX != endX && startY != endY) {
          // scale to image buffer
          const scale = imageBuffer.width / annotatingCanvas.clientWidth;
          const rect = constructRect({
            action,
            startX: startX * scale,
            startY: startY * scale,
            endX: endX * scale,
            endY: endY * scale,
          });
          setDrawRects(prev => [...prev, rect]);
        }

        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const handleDeleteRect = (index: number): void => {
      const updatedRects = [...drawRects];
      updatedRects.splice(index, 1);
      setDrawRects(updatedRects);
    };

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={styles} />
        <div class="editor__image-container">
          <div class="editor__canvas-container" ref={measurementRef}>
            <canvas ref={screenshotRef}></canvas>
            <canvas class="editor__canvas-annotate" ref={annotatingRef} onMouseDown={handleMouseDown}></canvas>
            <div class="editor__rect-container" ref={rectContainerRef}>
              {drawRects.map((rect, index) => (
                <div
                  key={index}
                  class="editor__rect"
                  style={{
                    top: `${rect.y * scaleFactor}px`,
                    left: `${rect.x * scaleFactor}px`,
                    width: `${rect.width * scaleFactor}px`,
                    height: `${rect.height * scaleFactor}px`,
                  }}
                  onMouseDown={handleMouseDown}
                >
                  <button type="button" onClick={() => handleDeleteRect(index)}>
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Toolbar action={action} setAction={setAction} />
      </div>
    );
  };
}
