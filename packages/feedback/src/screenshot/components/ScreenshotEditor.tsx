/* eslint-disable max-lines */
import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type * as Hooks from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import CropCornerFactory from './CropCorner';
import CropIconFactory from './CropIcon';
import PenIconFactory from './PenIcon';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useTakeScreenshotFactory } from './useTakeScreenshot';

const CROP_BUTTON_SIZE = 30;
const CROP_BUTTON_BORDER = 3;
const CROP_BUTTON_OFFSET = CROP_BUTTON_SIZE + CROP_BUTTON_BORDER;
const DPI = WINDOW.devicePixelRatio;

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
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface Rect {
  x: number;
  y: number;
  height: number;
  width: number;
}

const constructRect = (box: Box): Rect => {
  return {
    x: Math.min(box.startX, box.endX),
    y: Math.min(box.startY, box.endY),
    width: Math.abs(box.startX - box.endX),
    height: Math.abs(box.startY - box.endY),
  };
};

const getContainedSize = (img: HTMLCanvasElement): Box => {
  const imgClientHeight = img.clientHeight;
  const imgClientWidth = img.clientWidth;
  const ratio = img.width / img.height;
  let width = imgClientHeight * ratio;
  let height = imgClientHeight;
  if (width > imgClientWidth) {
    width = imgClientWidth;
    height = imgClientWidth / ratio;
  }
  const x = (imgClientWidth - width) / 2;
  const y = (imgClientHeight - height) / 2;
  return { startX: x, startY: y, endX: width + x, endY: height + y };
};

export function ScreenshotEditorFactory({
  h,
  hooks,
  imageBuffer,
  dialog,
  options,
}: FactoryParams): ComponentType<Props> {
  const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
  const CropCorner = CropCornerFactory({ h });
  const PenIcon = PenIconFactory({ h });
  const CropIcon = CropIconFactory({ h });

  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = hooks.useMemo(() => ({ __html: createScreenshotInputStyles(options.styleNonce).innerText }), []);

    const canvasContainerRef = hooks.useRef<HTMLDivElement>(null);
    const cropContainerRef = hooks.useRef<HTMLDivElement>(null);
    const croppingRef = hooks.useRef<HTMLCanvasElement>(null);
    const annotatingRef = hooks.useRef<HTMLCanvasElement>(null);
    const [croppingRect, setCroppingRect] = hooks.useState<Box>({ startX: 0, startY: 0, endX: 0, endY: 0 });
    const [confirmCrop, setConfirmCrop] = hooks.useState(false);
    const [isResizing, setIsResizing] = hooks.useState(false);
    const [isCropping, setIsCropping] = hooks.useState(true);
    const [isAnnotating, setIsAnnotating] = hooks.useState(false);

    hooks.useEffect(() => {
      WINDOW.addEventListener('resize', resize);

      return () => {
        WINDOW.removeEventListener('resize', resize);
      };
    }, []);

    function resizeCanvas(canvasRef: Hooks.Ref<HTMLCanvasElement>, imageDimensions: Rect): void {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      canvas.width = imageDimensions.width * DPI;
      canvas.height = imageDimensions.height * DPI;
      canvas.style.width = `${imageDimensions.width}px`;
      canvas.style.height = `${imageDimensions.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(DPI, DPI);
      }
    }

    function resize(): void {
      const imageDimensions = constructRect(getContainedSize(imageBuffer));

      resizeCanvas(croppingRef, imageDimensions);
      resizeCanvas(annotatingRef, imageDimensions);

      const cropContainer = cropContainerRef.current;
      if (cropContainer) {
        cropContainer.style.width = `${imageDimensions.width}px`;
        cropContainer.style.height = `${imageDimensions.height}px`;
      }

      setCroppingRect({ startX: 0, startY: 0, endX: imageDimensions.width, endY: imageDimensions.height });
    }

    hooks.useEffect(() => {
      const cropper = croppingRef.current;
      if (!cropper) {
        return;
      }

      const ctx = cropper.getContext('2d');
      if (!ctx) {
        return;
      }

      const imageDimensions = constructRect(getContainedSize(imageBuffer));
      const croppingBox = constructRect(croppingRect);
      ctx.clearRect(0, 0, imageDimensions.width, imageDimensions.height);

      if (!isCropping) {
        return;
      }

      // draw gray overlay around the selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, imageDimensions.width, imageDimensions.height);
      ctx.clearRect(croppingBox.x, croppingBox.y, croppingBox.width, croppingBox.height);

      // draw selection border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(croppingBox.x + 1, croppingBox.y + 1, croppingBox.width - 2, croppingBox.height - 2);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(croppingBox.x + 3, croppingBox.y + 3, croppingBox.width - 6, croppingBox.height - 6);
    }, [croppingRect, isCropping]);

    function onGrabButton(e: Event, corner: string): void {
      setIsAnnotating(false);
      setConfirmCrop(false);
      setIsResizing(true);
      const handleMouseMove = makeHandleMouseMove(corner);
      const handleMouseUp = (): void => {
        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
        setConfirmCrop(true);
        setIsResizing(false);
      };

      DOCUMENT.addEventListener('mouseup', handleMouseUp);
      DOCUMENT.addEventListener('mousemove', handleMouseMove);
    }

    const makeHandleMouseMove = hooks.useCallback((corner: string) => {
      return function (e: MouseEvent) {
        if (!croppingRef.current) {
          return;
        }
        const cropCanvas = croppingRef.current;
        const cropBoundingRect = cropCanvas.getBoundingClientRect();
        const mouseX = e.clientX - cropBoundingRect.x;
        const mouseY = e.clientY - cropBoundingRect.y;
        switch (corner) {
          case 'top-left':
            setCroppingRect(prev => ({
              ...prev,
              startX: Math.min(Math.max(0, mouseX), prev.endX - CROP_BUTTON_OFFSET),
              startY: Math.min(Math.max(0, mouseY), prev.endY - CROP_BUTTON_OFFSET),
            }));
            break;
          case 'top-right':
            setCroppingRect(prev => ({
              ...prev,
              endX: Math.max(Math.min(mouseX, cropCanvas.width / DPI), prev.startX + CROP_BUTTON_OFFSET),
              startY: Math.min(Math.max(0, mouseY), prev.endY - CROP_BUTTON_OFFSET),
            }));
            break;
          case 'bottom-left':
            setCroppingRect(prev => ({
              ...prev,
              startX: Math.min(Math.max(0, mouseX), prev.endX - CROP_BUTTON_OFFSET),
              endY: Math.max(Math.min(mouseY, cropCanvas.height / DPI), prev.startY + CROP_BUTTON_OFFSET),
            }));
            break;
          case 'bottom-right':
            setCroppingRect(prev => ({
              ...prev,
              endX: Math.max(Math.min(mouseX, cropCanvas.width / DPI), prev.startX + CROP_BUTTON_OFFSET),
              endY: Math.max(Math.min(mouseY, cropCanvas.height / DPI), prev.startY + CROP_BUTTON_OFFSET),
            }));
            break;
        }
      };
    }, []);

    // DRAGGING FUNCTIONALITY.
    const initialPositionRef = hooks.useRef({ initialX: 0, initialY: 0 });

    function onDragStart(e: MouseEvent): void {
      if (isResizing) return;

      initialPositionRef.current = { initialX: e.clientX, initialY: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const cropCanvas = croppingRef.current;
        if (!cropCanvas) return;

        const deltaX = moveEvent.clientX - initialPositionRef.current.initialX;
        const deltaY = moveEvent.clientY - initialPositionRef.current.initialY;

        setCroppingRect(prev => {
          // Math.max stops it from going outside of the borders
          const newStartX = Math.max(
            0,
            Math.min(prev.startX + deltaX, cropCanvas.width / DPI - (prev.endX - prev.startX)),
          );
          const newStartY = Math.max(
            0,
            Math.min(prev.startY + deltaY, cropCanvas.height / DPI - (prev.endY - prev.startY)),
          );
          // Don't want to change size, just position
          const newEndX = newStartX + (prev.endX - prev.startX);
          const newEndY = newStartY + (prev.endY - prev.startY);

          initialPositionRef.current.initialX = moveEvent.clientX;
          initialPositionRef.current.initialY = moveEvent.clientY;

          return {
            startX: newStartX,
            startY: newStartY,
            endX: newEndX,
            endY: newEndY,
          };
        });
      };

      const handleMouseUp = (): void => {
        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    }

    function onAnnotateStart(): void {
      if (!isAnnotating) {
        return;
      }

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const annotateCanvas = annotatingRef.current;
        if (annotateCanvas) {
          const rect = annotateCanvas.getBoundingClientRect();

          const x = moveEvent.clientX - rect.x;
          const y = moveEvent.clientY - rect.y;

          const ctx = annotateCanvas.getContext('2d');
          if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
          }
        }
      };

      const handleMouseUp = (): void => {
        const ctx = annotatingRef.current?.getContext('2d');
        // starts a new path so on next mouse down, the lines won't connect
        if (ctx) {
          ctx.beginPath();
        }

        // draws the annotation onto the image buffer
        // TODO: move this to a better place
        applyAnnotation();

        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    }

    function applyCrop(): void {
      const cutoutCanvas = DOCUMENT.createElement('canvas');
      const imageBox = constructRect(getContainedSize(imageBuffer));
      const croppingBox = constructRect(croppingRect);
      cutoutCanvas.width = croppingBox.width * DPI;
      cutoutCanvas.height = croppingBox.height * DPI;

      const cutoutCtx = cutoutCanvas.getContext('2d');
      if (cutoutCtx && imageBuffer) {
        cutoutCtx.drawImage(
          imageBuffer,
          (croppingBox.x / imageBox.width) * imageBuffer.width,
          (croppingBox.y / imageBox.height) * imageBuffer.height,
          (croppingBox.width / imageBox.width) * imageBuffer.width,
          (croppingBox.height / imageBox.height) * imageBuffer.height,
          0,
          0,
          cutoutCanvas.width,
          cutoutCanvas.height,
        );
      }

      const ctx = imageBuffer.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, imageBuffer.width, imageBuffer.height);
        imageBuffer.width = cutoutCanvas.width;
        imageBuffer.height = cutoutCanvas.height;
        imageBuffer.style.width = `${croppingBox.width}px`;
        imageBuffer.style.height = `${croppingBox.height}px`;
        ctx.drawImage(cutoutCanvas, 0, 0);
        resize();
      }
    }

    function applyAnnotation(): void {
      // draw the annotations onto the image (ie "squash" the canvases)
      const imageCtx = imageBuffer.getContext('2d');
      const annotateCanvas = annotatingRef.current;
      if (imageCtx && annotateCanvas) {
        imageCtx.drawImage(
          annotateCanvas,
          0,
          0,
          annotateCanvas.width,
          annotateCanvas.height,
          0,
          0,
          imageBuffer.width,
          imageBuffer.height,
        );

        // clear the annotation canvas
        const annotateCtx = annotateCanvas.getContext('2d');
        if (annotateCtx) {
          annotateCtx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height);
        }
      }
    }

    useTakeScreenshot({
      onBeforeScreenshot: hooks.useCallback(() => {
        (dialog.el as HTMLElement).style.display = 'none';
      }, []),
      onScreenshot: hooks.useCallback(
        (imageSource: HTMLVideoElement) => {
          const context = imageBuffer.getContext('2d');
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          imageBuffer.width = imageSource.videoWidth;
          imageBuffer.height = imageSource.videoHeight;
          imageBuffer.style.width = '100%';
          imageBuffer.style.height = '100%';
          context.drawImage(imageSource, 0, 0);
        },
        [imageBuffer],
      ),
      onAfterScreenshot: hooks.useCallback(() => {
        (dialog.el as HTMLElement).style.display = 'block';
        const container = canvasContainerRef.current;
        container?.appendChild(imageBuffer);
        resize();
      }, []),
      onError: hooks.useCallback(error => {
        (dialog.el as HTMLElement).style.display = 'block';
        onError(error);
      }, []),
    });

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={styles} />
        <div class="editor__image-container">
          <div class="editor__canvas-container" ref={canvasContainerRef}>
            <div
              class={`editor__crop-container ${isAnnotating ? 'editor__crop-container--inactive' : ''}
              ${confirmCrop ? 'editor__crop-container--move' : ''}`}
              ref={cropContainerRef}
            >
              <canvas onMouseDown={onDragStart} ref={croppingRef}></canvas>
              {isCropping && (
                <div>
                  <CropCorner
                    left={croppingRect.startX - CROP_BUTTON_BORDER}
                    top={croppingRect.startY - CROP_BUTTON_BORDER}
                    onGrabButton={onGrabButton}
                    corner="top-left"
                  ></CropCorner>
                  <CropCorner
                    left={croppingRect.endX - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
                    top={croppingRect.startY - CROP_BUTTON_BORDER}
                    onGrabButton={onGrabButton}
                    corner="top-right"
                  ></CropCorner>
                  <CropCorner
                    left={croppingRect.startX - CROP_BUTTON_BORDER}
                    top={croppingRect.endY - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
                    onGrabButton={onGrabButton}
                    corner="bottom-left"
                  ></CropCorner>
                  <CropCorner
                    left={croppingRect.endX - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
                    top={croppingRect.endY - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
                    onGrabButton={onGrabButton}
                    corner="bottom-right"
                  ></CropCorner>
                </div>
              )}
              {isCropping && (
                <div
                  style={{
                    left: Math.max(0, croppingRect.endX - 191),
                    top: Math.max(0, croppingRect.endY + 8),
                  }}
                  class={`editor__crop-btn-group ${confirmCrop ? 'editor__crop-btn-group--active' : ''}`}
                >
                  <button
                    onClick={e => {
                      e.preventDefault();
                      if (croppingRef.current) {
                        setCroppingRect({
                          startX: 0,
                          startY: 0,
                          endX: croppingRef.current.width / DPI,
                          endY: croppingRef.current.height / DPI,
                        });
                      }
                      setConfirmCrop(false);
                    }}
                    class="btn btn--default"
                  >
                    {options.cancelButtonLabel}
                  </button>
                  <button
                    onClick={e => {
                      e.preventDefault();
                      applyCrop();
                      setConfirmCrop(false);
                    }}
                    class="btn btn--primary"
                  >
                    {options.confirmButtonLabel}
                  </button>
                </div>
              )}
            </div>
            <canvas
              class={`editor__annotation ${isAnnotating ? 'editor__annotation--active' : ''}`}
              onMouseDown={onAnnotateStart}
              ref={annotatingRef}
            ></canvas>
          </div>
        </div>
        {options._experiments.annotations && (
          <div class="editor__tool-container">
            <div />
            <div class="editor__tool-bar">
              <button
                class={`editor__tool ${isCropping ? 'editor__tool--active' : ''}`}
                onClick={e => {
                  e.preventDefault();
                  setIsCropping(!isCropping);
                  setIsAnnotating(false);
                }}
              >
                <CropIcon />
              </button>
              <button
                class={`editor__tool ${isAnnotating ? 'editor__tool--active' : ''}`}
                onClick={e => {
                  e.preventDefault();
                  setIsAnnotating(!isAnnotating);
                  setIsCropping(false);
                }}
              >
                <PenIcon />
              </button>
            </div>
            <div />
          </div>
        )}
      </div>
    );
  };
}
