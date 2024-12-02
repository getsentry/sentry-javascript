/* eslint-disable max-lines */
import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type * as Hooks from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import CropCornerFactory from './CropCorner';
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

  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = hooks.useMemo(() => ({ __html: createScreenshotInputStyles(options.styleNonce).innerText }), []);
    const CropCorner = CropCornerFactory({ h });

    const canvasContainerRef = hooks.useRef<HTMLDivElement>(null);
    const cropContainerRef = hooks.useRef<HTMLDivElement>(null);
    const croppingRef = hooks.useRef<HTMLCanvasElement>(null);
    const [croppingRect, setCroppingRect] = hooks.useState<Box>({ startX: 0, startY: 0, endX: 0, endY: 0 });
    const [confirmCrop, setConfirmCrop] = hooks.useState(false);
    const [isResizing, setIsResizing] = hooks.useState(false);

    hooks.useEffect(() => {
      WINDOW.addEventListener('resize', resizeCropper, false);
    }, []);

    function resizeCropper(): void {
      const cropper = croppingRef.current;
      const imageDimensions = constructRect(getContainedSize(imageBuffer));
      if (cropper) {
        cropper.width = imageDimensions.width * DPI;
        cropper.height = imageDimensions.height * DPI;
        cropper.style.width = `${imageDimensions.width}px`;
        cropper.style.height = `${imageDimensions.height}px`;
        const ctx = cropper.getContext('2d');
        if (ctx) {
          ctx.scale(DPI, DPI);
        }
      }

      const cropButton = cropContainerRef.current;
      if (cropButton) {
        cropButton.style.width = `${imageDimensions.width}px`;
        cropButton.style.height = `${imageDimensions.height}px`;
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
    }, [croppingRect]);

    function onGrabButton(e: Event, corner: string): void {
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

    function submit(): void {
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
        resizeCropper();
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
        container && container.appendChild(imageBuffer);
        resizeCropper();
      }, []),
      onError: hooks.useCallback(error => {
        (dialog.el as HTMLElement).style.display = 'block';
        onError(error);
      }, []),
    });

    return (
      <div class="editor">
        <style nonce={options.styleNonce} dangerouslySetInnerHTML={styles} />
        <div class="editor__canvas-container" ref={canvasContainerRef}>
          <div class="editor__crop-container" style={{ position: 'absolute', zIndex: 1 }} ref={cropContainerRef}>
            <canvas
              onMouseDown={onDragStart}
              style={{ position: 'absolute', cursor: confirmCrop ? 'move' : 'auto' }}
              ref={croppingRef}
            ></canvas>
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
            <div
              style={{
                left: Math.max(0, croppingRect.endX - 191),
                top: Math.max(0, croppingRect.endY + 8),
                display: confirmCrop ? 'flex' : 'none',
              }}
              class="editor__crop-btn-group"
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
                  submit();
                  setConfirmCrop(false);
                }}
                class="btn btn--primary"
              >
                {options.confirmButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
}
