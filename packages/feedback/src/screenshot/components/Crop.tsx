import type { FeedbackInternalOptions } from '@sentry/core';
import type { VNode, h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import CropCornerFactory from './CropCorner';

const CROP_BUTTON_SIZE = 30;
const CROP_BUTTON_BORDER = 3;
const CROP_BUTTON_OFFSET = CROP_BUTTON_SIZE + CROP_BUTTON_BORDER;
const DPI = WINDOW.devicePixelRatio;

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

const constructRect = (box: Box): Rect => ({
  x: Math.min(box.startX, box.endX),
  y: Math.min(box.startY, box.endY),
  width: Math.abs(box.startX - box.endX),
  height: Math.abs(box.startY - box.endY),
});

const getContainedSize = (img: HTMLCanvasElement): Rect => {
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
  return { x: x, y: y, width: width, height: height };
};

interface FactoryParams {
  h: typeof hType;
  hooks: typeof Hooks;
  options: FeedbackInternalOptions;
}

export default function CropFactory({ h, hooks, options }: FactoryParams): (props: {
  action: 'crop' | 'annotate' | '';
  imageBuffer: HTMLCanvasElement;
  croppingRef: Hooks.Ref<HTMLCanvasElement>;
  cropContainerRef: Hooks.Ref<HTMLDivElement>;
  croppingRect: Box;
  setCroppingRect: Hooks.StateUpdater<Box>;
  resize: () => void;
}) => VNode {
  const CropCorner = CropCornerFactory({ h });
  return function Crop({
    action,
    imageBuffer,
    croppingRef,
    cropContainerRef,
    croppingRect,
    setCroppingRect,
    resize,
  }: {
    action: 'crop' | 'annotate' | '';
    imageBuffer: HTMLCanvasElement;
    croppingRef: Hooks.Ref<HTMLCanvasElement>;
    cropContainerRef: Hooks.Ref<HTMLDivElement>;
    croppingRect: Box;
    setCroppingRect: Hooks.StateUpdater<Box>;
    resize: () => void;
  }): VNode {
    const initialPositionRef = hooks.useRef({ initialX: 0, initialY: 0 });

    const [isResizing, setIsResizing] = hooks.useState(false);
    const [confirmCrop, setConfirmCrop] = hooks.useState(false);

    hooks.useEffect(() => {
      const cropper = croppingRef.current;
      if (!cropper) {
        return;
      }

      const ctx = cropper.getContext('2d');
      if (!ctx) {
        return;
      }

      const imageDimensions = getContainedSize(imageBuffer);
      const croppingBox = constructRect(croppingRect);
      ctx.clearRect(0, 0, imageDimensions.width, imageDimensions.height);

      if (action !== 'crop') {
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
    }, [croppingRect, action]);

    // Resizing logic
    const makeHandleMouseMove = hooks.useCallback((corner: string) => {
      return (e: MouseEvent) => {
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

    // Dragging logic
    const onDragStart = (e: MouseEvent): void => {
      if (isResizing) {
        return;
      }

      initialPositionRef.current = { initialX: e.clientX, initialY: e.clientY };

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const cropCanvas = croppingRef.current;
        if (!cropCanvas) {
          return;
        }

        const deltaX = moveEvent.clientX - initialPositionRef.current.initialX;
        const deltaY = moveEvent.clientY - initialPositionRef.current.initialY;

        setCroppingRect(prev => {
          const newStartX = Math.max(
            0,
            Math.min(prev.startX + deltaX, cropCanvas.width / DPI - (prev.endX - prev.startX)),
          );
          const newStartY = Math.max(
            0,
            Math.min(prev.startY + deltaY, cropCanvas.height / DPI - (prev.endY - prev.startY)),
          );

          const newEndX = newStartX + (prev.endX - prev.startX);
          const newEndY = newStartY + (prev.endY - prev.startY);

          initialPositionRef.current.initialX = moveEvent.clientX;
          initialPositionRef.current.initialY = moveEvent.clientY;

          return { startX: newStartX, startY: newStartY, endX: newEndX, endY: newEndY };
        });
      };

      const handleMouseUp = (): void => {
        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const onGrabButton = (e: Event, corner: string): void => {
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
    };

    function applyCrop(): void {
      const cutoutCanvas = DOCUMENT.createElement('canvas');
      const imageBox = getContainedSize(imageBuffer);
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

    return (
      <div
        class={`editor__crop-container ${action === 'crop' ? '' : 'editor__crop-container--inactive'}
              ${confirmCrop ? 'editor__crop-container--move' : ''}`}
        ref={cropContainerRef}
      >
        <canvas onMouseDown={onDragStart} ref={croppingRef}></canvas>
        {action === 'crop' && (
          <div>
            <CropCorner
              left={croppingRect.startX - CROP_BUTTON_BORDER}
              top={croppingRect.startY - CROP_BUTTON_BORDER}
              onGrabButton={onGrabButton}
              corner="top-left"
            />
            <CropCorner
              left={croppingRect.endX - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
              top={croppingRect.startY - CROP_BUTTON_BORDER}
              onGrabButton={onGrabButton}
              corner="top-right"
            />
            <CropCorner
              left={croppingRect.startX - CROP_BUTTON_BORDER}
              top={croppingRect.endY - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
              onGrabButton={onGrabButton}
              corner="bottom-left"
            />
            <CropCorner
              left={croppingRect.endX - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
              top={croppingRect.endY - CROP_BUTTON_SIZE + CROP_BUTTON_BORDER}
              onGrabButton={onGrabButton}
              corner="bottom-right"
            />
          </div>
        )}
        {action === 'crop' && (
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
    );
  };
}
