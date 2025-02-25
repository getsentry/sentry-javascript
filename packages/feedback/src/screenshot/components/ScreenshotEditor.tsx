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
type MaybeCanvas = HTMLCanvasElement | null;

interface Box {
  action: Action;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface DrawCommand {
  action: Action;
  x: number;
  y: number;
  height: number;
  width: number;
}

const DPI = WINDOW.devicePixelRatio;

const constructRect = (box: Box): DrawCommand => ({
  action: box.action,
  x: Math.min(box.startX, box.endX),
  y: Math.min(box.startY, box.endY),
  width: Math.abs(box.startX - box.endX),
  height: Math.abs(box.startY - box.endY),
});

function getAspectRatio(canvas: {width: number, height: number}): number {
  return canvas.width / canvas.height;
}

// const getContainedSize = (measurementDiv: HTMLDivElement, canvas: HTMLCanvasElement): DrawCommand => {
//   const imgClientHeight = measurementDiv.clientHeight;
//   const imgClientWidth = measurementDiv.clientWidth;
//   const ratio = getAspectRatio(canvas);
//   let width = imgClientHeight * ratio;
//   let height = imgClientHeight;
//   if (width > imgClientWidth) {
//     width = imgClientWidth;
//     height = imgClientWidth / ratio;
//   }
//   const x = (imgClientWidth - width) / 2;
//   const y = (imgClientHeight - height) / 2;
//   return { action: '', x: x, y: y, width: width, height: height };
// };

function drawRect(command: DrawCommand, ctx: CanvasRenderingContext2D, color: string, scale: number = 1): void {
  const scaledX = command.x * scale;
  const scaledY = command.y * scale;
  const scaledWidth = command.width * scale;
  const scaledHeight = command.height * scale;

  switch (command.action) {
    case 'highlight': {
      // creates a shadow around
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 50;

      // draws a rectangle first with a shadow
      ctx.fillStyle = color;
      ctx.fillRect(scaledX - 1, scaledY - 1, scaledWidth + 2, scaledHeight + 2);

      // cut out the inside of the rectangle
      ctx.clearRect(scaledX, scaledY, scaledWidth, scaledHeight);

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

// function getNonNullRef<T>(ref: Hooks.MutableRef<T | null>, init: () => T): T {
//   const canvas = ref.current;
//   if (canvas === null) {
//     ref.current = init();
//   }
//   return ref.current as T;
// }

function with2dContext(
  canvas: MaybeCanvas,
  options: CanvasRenderingContext2DSettings,
  callback: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void,
): void {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d', options);
  if (ctx) {
    callback(canvas, ctx);
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
  const editorStyleInnerText = { __html: createScreenshotInputStyles(options.styleNonce).innerText };

  const dialogStyle = (dialog.el as HTMLElement).style;

  return function ScreenshotEditor({ onError }: Props): VNode {
    // The canvas that contains the original screenshot
    const [imageSource, setImageSource] = hooks.useState<HTMLCanvasElement>(() => DOCUMENT.createElement('canvas'))

    // Hide the whole feedback widget when we take the screenshot
    const [isVisible, setIsVisible] = hooks.useState<boolean>(true);

    // Data for rendering:
    const [action, setAction] = hooks.useState<'highlight' | 'hide' | ''>('');
    const [drawCommands, setDrawCommands] = hooks.useState<DrawCommand[]>([]);
    const [currentDrawCommand, setCurrentDrawCommand] = hooks.useState<DrawCommand | undefined>(undefined);

    // Refs to our html components:
    const measurementRef = hooks.useRef<HTMLDivElement | null>(null);
    const backgroundRef = hooks.useRef<MaybeCanvas>(null);
    const foregroundRef = hooks.useRef<MaybeCanvas>(null);

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

    // The initial resize, to measure the area and set the children to the correct size
    hooks.useLayoutEffect(() => {
      const handleResize = (): void => {
        if (!isVisible) {
          return;
        }

        const measurementDiv = measurementRef.current;
        if (!measurementDiv) {
          return;
        }

        with2dContext(imageSource, {alpha: false}, (canvas) => {
          setScaleFactor(Math.min(
            measurementDiv.clientWidth / canvas.width,
            measurementDiv.clientHeight / canvas.height
          ));
        });
      };

      handleResize();
      WINDOW.addEventListener('resize', handleResize);
      return () => {
        WINDOW.removeEventListener('resize', handleResize);
      };
    }, [imageSource, drawCommands, isVisible]);

    const setCanvasSize = hooks.useCallback((maybeCanvas: MaybeCanvas, scale: number): void => {
      with2dContext(maybeCanvas, {alpha: true}, (canvas, ctx) => {
        console.log('setCanvasSize', canvas, scale)
        canvas.width = imageSource.width * scale;
        canvas.height = imageSource.height * scale;
        // ctx.scale(DPI, DPI);
      });
    }, [imageSource]);

    const drawBackground = hooks.useCallback((maybeCanvas: MaybeCanvas): void => {
      with2dContext(maybeCanvas, {alpha: false}, (canvas, ctx) => {
        console.log(
          'drawBackground x7',
          {width: imageSource.width, height: imageSource.height},
          {width: canvas.width, height: canvas.height}
        );

        ctx.drawImage(
          imageSource,
          0, 0, imageSource.width, imageSource.height,
          0, 0, canvas.width, canvas.height);
      });
    }, [imageSource]);

    const drawForeground = hooks.useCallback((maybeCanvas: MaybeCanvas): void => {
      with2dContext(maybeCanvas, {alpha: true}, (canvas, ctx) => {
        // If there's anything to draw, then we'll first grey-out the background
        if (currentDrawCommand || drawCommands.length) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        drawCommands.forEach(command => {
          drawRect(command, ctx, strokeColor, 1);
        });

        if (currentDrawCommand) {
          drawRect(currentDrawCommand, ctx, strokeColor, 1);
        }
      });
    }, [currentDrawCommand, drawCommands]);

    // Draw the screenshot into the background
    hooks.useEffect(() => {
      console.log('useEffect:background', {scaleFactor})
      setCanvasSize(backgroundRef.current, scaleFactor / DPI);

      drawBackground(backgroundRef.current);
    }, [drawBackground, scaleFactor]);

    // Draw the commands into the foreground
    hooks.useEffect(() => {
      setCanvasSize(foregroundRef.current, scaleFactor / DPI);
      with2dContext(foregroundRef.current, {alpha: true}, (canvas, ctx) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      })
      drawForeground(foregroundRef.current);
    }, [drawForeground, scaleFactor]);

    // Draw into the forms imageBuffer
    hooks.useEffect(() => {
      setCanvasSize(imageBuffer, 1);
      drawBackground(imageBuffer);
      drawForeground(imageBuffer);
    }, [drawBackground, drawForeground]);

    useTakeScreenshot({
      onBeforeScreenshot: hooks.useCallback(() => {
        dialogStyle.display = 'none';
        setIsVisible(false);
      }, []),
      onScreenshot: hooks.useCallback((screenshotVideo: HTMLVideoElement) => {
        const canvas = DOCUMENT.createElement('canvas');
        canvas.width = screenshotVideo.videoWidth;
        canvas.height = screenshotVideo.videoHeight;
        canvas.getContext('2d', { alpha: false })?.drawImage(screenshotVideo, 0, 0);
        setImageSource(canvas);

        imageBuffer.width = screenshotVideo.videoWidth;
        imageBuffer.height = screenshotVideo.videoHeight;
      }, []),
      onAfterScreenshot: hooks.useCallback(() => {
        dialogStyle.display = 'block';
        setIsVisible(true);
      }, []),
      onError: hooks.useCallback(error => {
        dialogStyle.display = 'block';
        setIsVisible(true);
        onError(error);
      }, []),
    });

    const handleMouseDown = (e: MouseEvent): void => {
      // const annotatingCanvas = annotatingRef.current;
      // if (!action || !annotatingCanvas) {
      //   return;
      // }

      // const boundingRect = annotatingCanvas.getBoundingClientRect();

      // const startX = e.clientX - boundingRect.left;
      // const startY = e.clientY - boundingRect.top;

      // const handleMouseMove = (e: MouseEvent): void => {
      //   const endX = e.clientX - boundingRect.left;
      //   const endY = e.clientY - boundingRect.top;
      //   const rect = constructRect({ action, startX, startY, endX, endY });
      //   // prevent drawing when just clicking (not dragging) on the canvas
      //   if (startX != endX && startY != endY) {
      //     setCurrentDrawCommand(rect);
      //   }
      // };

      // const handleMouseUp = (e: MouseEvent): void => {
      //   // no rect is being drawn anymore, so setting active rect to undefined
      //   setCurrentDrawCommand(undefined);
      //   const endX = Math.max(0, Math.min(e.clientX - boundingRect.left, annotatingCanvas.width / DPI));
      //   const endY = Math.max(0, Math.min(e.clientY - boundingRect.top, annotatingCanvas.height / DPI));
      //   // prevent drawing a rect when just clicking (not dragging) on the canvas (ie. clicking delete)
      //   if (startX != endX && startY != endY) {
      //     // scale to image buffer
      //     const scale = imageBuffer.width / annotatingCanvas.clientWidth;
      //     const rect = constructRect({
      //       action,
      //       startX: startX * scale,
      //       startY: startY * scale,
      //       endX: endX * scale,
      //       endY: endY * scale,
      //     });
      //     setDrawCommands(prev => [...prev, rect]);
      //   }

      //   DOCUMENT.removeEventListener('mousemove', handleMouseMove);
      //   DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      // };

      // DOCUMENT.addEventListener('mousemove', handleMouseMove);
      // DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const handleDeleteRect = hooks.useCallback((index: number): void => {
      setDrawCommands((prev) => {
        const updatedRects = [...prev];
        updatedRects.splice(index, 1);
        return updatedRects;
      });
    }, []);

    // const imageDimensions = measurementRef.current ? getContainedSize(measurementRef.current, imageSource) : {width: 0, height: 0};
    const dimensions = {
      width: `${imageSource.width * scaleFactor}px`,
      height: `${imageSource.height * scaleFactor}px`,
    }

    const aspectRatio = getAspectRatio(imageSource);
    console.log({aspectRatio, scaleFactor})

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={editorStyleInnerText} />
        <div class="editor__image-container">
          <div class="editor__canvas-container" ref={measurementRef}>
            <canvas id="background" ref={backgroundRef} style={dimensions} />
            <canvas id="foreground" ref={foregroundRef} style={dimensions} />
            <div style={dimensions} onMouseDown={handleMouseDown}>
              {drawCommands.map((rect, index) => (
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
