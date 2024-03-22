/* eslint-disable max-lines */
import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint: needed for preact
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import type { Dialog } from '../../types';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useTakeScreenshot } from './useTakeScreenshot';

const CROP_BUTTON_SIZE = 30;
const CROP_BUTTON_BORDER = 3;
const CROP_BUTTON_OFFSET = CROP_BUTTON_SIZE + CROP_BUTTON_BORDER;

interface FactoryParams {
  h: typeof hType;
  imageBuffer: HTMLCanvasElement;
  dialog: Dialog;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeScreenshotEditorComponent({ h, imageBuffer, dialog }: FactoryParams): ComponentType<Props> {
  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const cropContainerRef = useRef<HTMLDivElement>(null);
    const croppingRef = useRef<HTMLCanvasElement>(null);
    const [croppingRect, setCroppingRect] = useState<Box>({ startX: 0, startY: 0, endX: 0, endY: 0 });
    const [confirmCrop, setConfirmCrop] = useState(false);

    useEffect(() => {
      WINDOW.addEventListener('resize', resizeCropper, false);
    }, []);

    function resizeCropper(): void {
      const cropper = croppingRef.current;
      const imageDimensions = constructRect(getContainedSize(imageBuffer));
      if (cropper) {
        cropper.width = imageDimensions.width;
        cropper.height = imageDimensions.height;
      }

      const cropButton = cropContainerRef.current;
      if (cropButton) {
        cropButton.style.width = `${imageDimensions.width}px`;
        cropButton.style.height = `${imageDimensions.height}px`;
        cropButton.style.left = `${imageDimensions.x}px`;
        cropButton.style.top = `${imageDimensions.y}px`;
      }

      setCroppingRect({ startX: 0, startY: 0, endX: imageDimensions.width, endY: imageDimensions.height });
    }

    useEffect(() => {
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
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 3;
      ctx.strokeRect(croppingBox.x, croppingBox.y, croppingBox.width, croppingBox.height);
    }, [croppingRect]);

    function onGrabButton(e: Event, corner: string): void {
      setConfirmCrop(false);
      const handleMouseMove = makeHandleMouseMove(corner);
      const handleMouseUp = (): void => {
        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
        setConfirmCrop(true);
      };

      DOCUMENT.addEventListener('mouseup', handleMouseUp);
      DOCUMENT.addEventListener('mousemove', handleMouseMove);
    }

    const makeHandleMouseMove = useCallback((corner: string) => {
      return function (e: MouseEvent) {
        if (!croppingRef.current) {
          return;
        }
        const cropCanvas = croppingRef.current;
        const cropBoundingRect = cropCanvas.getBoundingClientRect();
        const mouseX = e.clientX - cropBoundingRect.x;
        const mouseY = e.clientY - cropBoundingRect.y;
        switch (corner) {
          case 'topleft':
            setCroppingRect(prev => ({
              ...prev,
              startX: Math.min(Math.max(0, mouseX), prev.endX - CROP_BUTTON_OFFSET),
              startY: Math.min(Math.max(0, mouseY), prev.endY - CROP_BUTTON_OFFSET),
            }));
            break;
          case 'topright':
            setCroppingRect(prev => ({
              ...prev,
              endX: Math.max(Math.min(mouseX, cropCanvas.width), prev.startX + CROP_BUTTON_OFFSET),
              startY: Math.min(Math.max(0, mouseY), prev.endY - CROP_BUTTON_OFFSET),
            }));
            break;
          case 'bottomleft':
            setCroppingRect(prev => ({
              ...prev,
              startX: Math.min(Math.max(0, mouseX), prev.endX - CROP_BUTTON_OFFSET),
              endY: Math.max(Math.min(mouseY, cropCanvas.height), prev.startY + CROP_BUTTON_OFFSET),
            }));
            break;
          case 'bottomright':
            setCroppingRect(prev => ({
              ...prev,
              endX: Math.max(Math.min(mouseX, cropCanvas.width), prev.startX + CROP_BUTTON_OFFSET),
              endY: Math.max(Math.min(mouseY, cropCanvas.height), prev.startY + CROP_BUTTON_OFFSET),
            }));
            break;
        }
      };
    }, []);

    function submit(): void {
      const cutoutCanvas = DOCUMENT.createElement('canvas');
      const imageBox = constructRect(getContainedSize(imageBuffer));
      const croppingBox = constructRect(croppingRect);
      cutoutCanvas.width = croppingBox.width;
      cutoutCanvas.height = croppingBox.height;

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
          croppingBox.width,
          croppingBox.height,
        );
      }

      const ctx = imageBuffer.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, imageBuffer.width, imageBuffer.height);
        imageBuffer.width = cutoutCanvas.width;
        imageBuffer.height = cutoutCanvas.height;
        ctx.drawImage(cutoutCanvas, 0, 0);
        resizeCropper();
      }
    }

    useTakeScreenshot({
      onBeforeScreenshot: useCallback(() => {
        dialog.el.style.display = 'none';
      }, []),
      onScreenshot: useCallback(
        (imageSource: HTMLVideoElement) => {
          const context = imageBuffer.getContext('2d');
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          imageBuffer.width = imageSource.videoWidth;
          imageBuffer.height = imageSource.videoHeight;
          context.drawImage(imageSource, 0, 0);
        },
        [imageBuffer],
      ),
      onAfterScreenshot: useCallback(() => {
        dialog.el.style.display = 'block';
        const container = canvasContainerRef.current;
        container && container.appendChild(imageBuffer);
        resizeCropper();
      }, []),
      onError: useCallback(error => {
        dialog.el.style.display = 'block';
        onError(error);
      }, []),
    });

    return (
      <div class="editor">
        <style dangerouslySetInnerHTML={styles} />
        <div class="canvasContainer" ref={canvasContainerRef}>
          <div class="cropButtonContainer" style={{ position: 'absolute' }} ref={cropContainerRef}>
            <canvas style={{ position: 'absolute' }} ref={croppingRef}></canvas>
            <CropCorner
              left={croppingRect.startX}
              top={croppingRect.startY}
              onGrabButton={onGrabButton}
              corner="topleft"
            ></CropCorner>
            <CropCorner
              left={croppingRect.endX - CROP_BUTTON_SIZE}
              top={croppingRect.startY}
              onGrabButton={onGrabButton}
              corner="topright"
            ></CropCorner>
            <CropCorner
              left={croppingRect.startX}
              top={croppingRect.endY - CROP_BUTTON_SIZE}
              onGrabButton={onGrabButton}
              corner="bottomleft"
            ></CropCorner>
            <CropCorner
              left={croppingRect.endX - CROP_BUTTON_SIZE}
              top={croppingRect.endY - CROP_BUTTON_SIZE}
              onGrabButton={onGrabButton}
              corner="bottomright"
            ></CropCorner>
            <div
              style={{
                left: Math.max(0, croppingRect.endX - 191),
                top: Math.max(0, croppingRect.endY + 8),
                display: confirmCrop ? 'flex' : 'none',
              }}
              class="crop-btn-group"
            >
              <button
                onClick={e => {
                  e.preventDefault();
                  if (croppingRef.current) {
                    setCroppingRect({
                      startX: 0,
                      startY: 0,
                      endX: croppingRef.current.width,
                      endY: croppingRef.current.height,
                    });
                  }
                  setConfirmCrop(false);
                }}
                class="btn btn--default"
              >
                Cancel
              </button>
              <button
                onClick={e => {
                  e.preventDefault();
                  submit();
                  setConfirmCrop(false);
                }}
                class="btn btn--primary"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
}

function CropCorner({
  top,
  left,
  corner,
  onGrabButton,
}: {
  top: number;
  left: number;
  corner: string;
  onGrabButton: (e: Event, corner: string) => void;
}): VNode {
  return (
    <button
      class="crop-btn"
      style={{
        top: top,
        left: left,
        borderTop: corner === 'topleft' || corner === 'topright' ? 'solid purple' : 'none',
        borderLeft: corner === 'topleft' || corner === 'bottomleft' ? 'solid purple' : 'none',
        borderRight: corner === 'topright' || corner === 'bottomright' ? 'solid purple' : 'none',
        borderBottom: corner === 'bottomleft' || corner === 'bottomright' ? 'solid purple' : 'none',
        borderWidth: `${CROP_BUTTON_BORDER}px`,
        cursor: corner === 'topleft' || corner === 'bottomright' ? 'nwse-resize' : 'nesw-resize',
      }}
      onMouseDown={e => {
        e.preventDefault();
        onGrabButton(e, corner);
      }}
      onClick={e => {
        e.preventDefault();
      }}
    ></button>
  );
}
