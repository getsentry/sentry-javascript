import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import type { ComponentType, h as hType, VNode } from 'preact';
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

  /**
   * A ref to a Canvas Element that serves as our "value" or image output.
   */
  outputBuffer: HTMLCanvasElement;

  /**
   * A reference to the whole dialog (the parent of this component) so that we
   * can show/hide it and take a clean screenshot of the webpage.
   */
  dialog: ReturnType<FeedbackModalIntegration['createDialog']>;

  /**
   * The whole options object.
   *
   * Needed to set nonce and id values for editor specific styles
   */
  options: FeedbackInternalOptions;
}

interface Props {
  onError: (error: Error) => void;
}

type MaybeCanvas = HTMLCanvasElement | null;
type Screenshot = { canvas: HTMLCanvasElement; dpi: number };

type DrawType = 'highlight' | 'hide' | '';
interface DrawCommand {
  type: DrawType;
  x: number;
  y: number;
  h: number;
  w: number;
}

function drawRect(command: DrawCommand, ctx: CanvasRenderingContext2D, color: string): void {
  switch (command.type) {
    case 'highlight': {
      // creates a shadow around
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 50;

      // draws a rectangle first with a shadow
      ctx.fillStyle = color;
      ctx.fillRect(command.x - 1, command.y - 1, command.w + 2, command.h + 2);

      // cut out the inside of the rectangle
      ctx.clearRect(command.x, command.y, command.w, command.h);

      break;
    }
    case 'hide':
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(command.x, command.y, command.w, command.h);

      break;
    default:
      break;
  }
}

function with2dContext(
  canvas: MaybeCanvas,
  options: CanvasRenderingContext2DSettings,
  callback: (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void,
): void {
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext('2d', options);
  if (!ctx) {
    return;
  }
  callback(canvas, ctx);
}

function paintImage(maybeDest: MaybeCanvas, source: HTMLCanvasElement): void {
  with2dContext(maybeDest, { alpha: true }, (destCanvas, destCtx) => {
    destCtx.drawImage(source, 0, 0, source.width, source.height, 0, 0, destCanvas.width, destCanvas.height);
  });
}

// Paint the array of drawCommands into a canvas.
// Assuming this is the canvas foreground, and the background is cleaned.
function paintForeground(maybeCanvas: MaybeCanvas, strokeColor: string, drawCommands: DrawCommand[]): void {
  with2dContext(maybeCanvas, { alpha: true }, (canvas, ctx) => {
    // If there's anything to draw, then we'll first clear the canvas with
    // a transparent grey background
    if (drawCommands.length) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawCommands.forEach(command => {
      drawRect(command, ctx, strokeColor);
    });
  });
}

export function ScreenshotEditorFactory({
  h,
  hooks,
  outputBuffer,
  dialog,
  options,
}: FactoryParams): ComponentType<Props> {
  const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
  const Toolbar = ToolbarFactory({ h });
  const IconClose = IconCloseFactory({ h });
  const editorStyleInnerText = { __html: createScreenshotInputStyles(options.styleNonce).innerText };

  const dialogStyle = (dialog.el as HTMLElement).style;

  const ScreenshotEditor = ({ screenshot }: { screenshot: Screenshot }): VNode => {
    // Data for rendering:
    const [action, setAction] = hooks.useState<DrawType>('highlight');
    const [drawCommands, setDrawCommands] = hooks.useState<DrawCommand[]>([]);

    // Refs to our html components:
    const measurementRef = hooks.useRef<HTMLDivElement | null>(null);
    const backgroundRef = hooks.useRef<MaybeCanvas>(null);
    const foregroundRef = hooks.useRef<MaybeCanvas>(null);
    const mouseRef = hooks.useRef<HTMLDivElement | null>(null);

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
        const measurementDiv = measurementRef.current;
        if (!measurementDiv) {
          return;
        }

        with2dContext(screenshot.canvas, { alpha: false }, canvas => {
          const scale = Math.min(
            measurementDiv.clientWidth / canvas.width,
            measurementDiv.clientHeight / canvas.height,
          );
          setScaleFactor(scale);
        });

        // For Firefox, the canvas is not yet measured, so we need to wait for it to get the correct size
        if (measurementDiv.clientHeight === 0 || measurementDiv.clientWidth === 0) {
          setTimeout(handleResize, 0);
        }
      };

      handleResize();
      WINDOW.addEventListener('resize', handleResize);
      return () => {
        WINDOW.removeEventListener('resize', handleResize);
      };
    }, [screenshot]);

    // Set the size of the canvas element to match our screenshot
    const setCanvasSize = hooks.useCallback(
      (maybeCanvas: MaybeCanvas, scale: number): void => {
        with2dContext(maybeCanvas, { alpha: true }, (canvas, ctx) => {
          // Must call `scale()` before setting `width` & `height`
          ctx.scale(scale, scale);
          canvas.width = screenshot.canvas.width;
          canvas.height = screenshot.canvas.height;
        });
      },
      [screenshot],
    );

    // Draw the screenshot into the background
    hooks.useEffect(() => {
      setCanvasSize(backgroundRef.current, screenshot.dpi);
      paintImage(backgroundRef.current, screenshot.canvas);
    }, [screenshot]);

    // Draw the commands into the foreground
    hooks.useEffect(() => {
      setCanvasSize(foregroundRef.current, screenshot.dpi);
      with2dContext(foregroundRef.current, { alpha: true }, (canvas, ctx) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
      paintForeground(foregroundRef.current, strokeColor, drawCommands);
    }, [drawCommands, strokeColor]);

    // Draw into the output outputBuffer
    hooks.useEffect(() => {
      setCanvasSize(outputBuffer, screenshot.dpi);
      paintImage(outputBuffer, screenshot.canvas);
      with2dContext(DOCUMENT.createElement('canvas'), { alpha: true }, (foreground, ctx) => {
        ctx.scale(screenshot.dpi, screenshot.dpi); // The scale needs to be set before we set the width/height and paint
        foreground.width = screenshot.canvas.width;
        foreground.height = screenshot.canvas.height;
        paintForeground(foreground, strokeColor, drawCommands);
        paintImage(outputBuffer, foreground);
      });
    }, [drawCommands, screenshot, strokeColor]);

    const handleMouseDown = (e: MouseEvent): void => {
      if (!action || !mouseRef.current) {
        return;
      }

      const boundingRect = mouseRef.current.getBoundingClientRect();
      const startingPoint: DrawCommand = {
        type: action,
        x: e.offsetX / scaleFactor,
        y: e.offsetY / scaleFactor,
        w: 0,
        h: 0,
      };

      const getDrawCommand = (startingPoint: DrawCommand, e: MouseEvent): DrawCommand => {
        const x = (e.clientX - boundingRect.x) / scaleFactor;
        const y = (e.clientY - boundingRect.y) / scaleFactor;
        return {
          type: startingPoint.type,
          x: Math.min(startingPoint.x, x),
          y: Math.min(startingPoint.y, y),
          w: Math.abs(x - startingPoint.x),
          h: Math.abs(y - startingPoint.y),
        } as DrawCommand;
      };

      const handleMouseMove = (e: MouseEvent): void => {
        with2dContext(foregroundRef.current, { alpha: true }, (canvas, ctx) => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
        paintForeground(foregroundRef.current, strokeColor, [...drawCommands, getDrawCommand(startingPoint, e)]);
      };

      const handleMouseUp = (e: MouseEvent): void => {
        const drawCommand = getDrawCommand(startingPoint, e);

        // Prevent just clicking onto the canvas, mouse has to move at least 1 pixel
        if (drawCommand.w * scaleFactor >= 1 && drawCommand.h * scaleFactor >= 1) {
          setDrawCommands(prev => [...prev, drawCommand]);
        }
        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const deleteRect = hooks.useCallback((index: number): hType.JSX.MouseEventHandler<HTMLButtonElement> => {
      return (e: MouseEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDrawCommands(prev => {
          const updatedRects = [...prev];
          updatedRects.splice(index, 1);
          return updatedRects;
        });
      };
    }, []);

    const dimensions = {
      width: `${screenshot.canvas.width * scaleFactor}px`,
      height: `${screenshot.canvas.height * scaleFactor}px`,
    };

    const handleStopPropagation = (e: MouseEvent): void => {
      e.stopPropagation();
    };

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={editorStyleInnerText} />
        <div class="editor__image-container">
          <div class="editor__canvas-container" ref={measurementRef}>
            <canvas ref={backgroundRef} id="background" style={dimensions} />
            <canvas ref={foregroundRef} id="foreground" style={dimensions} />
            <div ref={mouseRef} onMouseDown={handleMouseDown} style={dimensions}>
              {drawCommands.map((rect, index) => (
                <div
                  key={index}
                  class="editor__rect"
                  style={{
                    top: `${rect.y * scaleFactor}px`,
                    left: `${rect.x * scaleFactor}px`,
                    width: `${rect.w * scaleFactor}px`,
                    height: `${rect.h * scaleFactor}px`,
                  }}
                >
                  <button
                    aria-label={options.removeHighlightText}
                    onClick={deleteRect(index)}
                    onMouseDown={handleStopPropagation}
                    onMouseUp={handleStopPropagation}
                    type="button"
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Toolbar options={options} action={action} setAction={setAction} />
      </div>
    );
  };

  return function Wrapper({ onError }: Props): VNode {
    const [screenshot, setScreenshot] = hooks.useState<undefined | Screenshot>();

    useTakeScreenshot({
      onBeforeScreenshot: hooks.useCallback(() => {
        dialogStyle.display = 'none';
      }, []),
      onScreenshot: hooks.useCallback((screenshotVideo: HTMLVideoElement, dpi: number) => {
        // Stash the original screenshot image so we can (re)draw it multiple times
        with2dContext(DOCUMENT.createElement('canvas'), { alpha: false }, (canvas, ctx) => {
          ctx.scale(dpi, dpi); // The scale needs to be set before we set the width/height and paint
          canvas.width = screenshotVideo.videoWidth;
          canvas.height = screenshotVideo.videoHeight;
          ctx.drawImage(screenshotVideo, 0, 0, canvas.width, canvas.height);

          setScreenshot({ canvas, dpi });
        });

        // The output buffer, we only need to set the width/height on this once, it stays the same forever
        outputBuffer.width = screenshotVideo.videoWidth;
        outputBuffer.height = screenshotVideo.videoHeight;
      }, []),
      onAfterScreenshot: hooks.useCallback(() => {
        dialogStyle.display = 'block';
      }, []),
      onError: hooks.useCallback(error => {
        dialogStyle.display = 'block';
        onError(error);
      }, []),
    });

    if (screenshot) {
      return <ScreenshotEditor screenshot={screenshot} />;
    }

    return <div />;
  };
}
