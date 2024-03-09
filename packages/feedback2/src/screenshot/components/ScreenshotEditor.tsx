import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOCUMENT, WINDOW } from '../../constants';
import type { Dialog } from '../../types';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useTakeScreenshot } from './useTakeScreenshot';

interface FactoryParams {
  h: typeof hType;
  imageBuffer: HTMLCanvasElement;
  dialog: Dialog;
}

interface Props {
  onError: (error: Error) => void;
}

interface Box {
  startx: number;
  starty: number;
  endx: number;
  endy: number;
}

interface Rect {
  x: number;
  y: number;
  height: number;
  width: number;
}

const constructRect = (box: Box): Rect => {
  return {
    x: Math.min(box.startx, box.endx),
    y: Math.min(box.starty, box.endy),
    width: Math.abs(box.startx - box.endx),
    height: Math.abs(box.starty - box.endy),
  };
};

const containedImage = (img: HTMLCanvasElement): Box => {
  const ratio = img.width / img.height;
  let width = img.clientHeight * ratio;
  let height = img.clientHeight;
  if (width > img.clientWidth) {
    width = img.clientWidth;
    height = img.clientWidth / ratio;
  }
  const x = (img.clientWidth - width) / 2;
  const y = (img.clientHeight - height) / 2;
  return { startx: x, starty: y, endx: width + x, endy: height + y };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeScreenshotEditorComponent({ h, imageBuffer, dialog }: FactoryParams): ComponentType<Props> {
  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const croppingRef = useRef<HTMLCanvasElement>(null);
    const [croppingRect, setCroppingRect] = useState<Box>({ startx: 0, starty: 0, endx: 0, endy: 0 });
    const [confirmCrop, setConfirmCrop] = useState(false);

    useEffect(() => {
      WINDOW.addEventListener('resize', handleResize, false);
    }, []);

    const handleResize = useCallback(() => {
      setCroppingRect(containedImage(imageBuffer));
      resizeCropper();
    }, []);

    useEffect(() => {
      const container = canvasContainerRef.current;
      container && container.appendChild(imageBuffer);
      setCroppingRect(containedImage(imageBuffer));
      resizeCropper();
    }, [imageBuffer]);

    function resizeCropper(): void {
      const cropper = croppingRef.current;
      if (cropper && canvasContainerRef.current) {
        cropper.width = canvasContainerRef.current.clientWidth;
        cropper.height = canvasContainerRef.current.clientHeight;
        cropper.style.width = `${canvasContainerRef.current.clientWidth}px`;
        cropper.style.height = `${canvasContainerRef.current.clientHeight}px`;
      }
    }

    function refreshCroppingBox(): void {
      const cropper = croppingRef.current;
      if (!cropper) {
        return;
      }

      const ctx = cropper.getContext('2d');
      if (!ctx) {
        return;
      }

      ctx.clearRect(0, 0, imageBuffer.width, imageBuffer.height);

      const imageDimensions = constructRect(containedImage(imageBuffer));
      const croppingBox = constructRect(croppingRect);

      // draw gray overlay around the selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(imageDimensions.x, imageDimensions.y, imageDimensions.width, imageDimensions.height);
      ctx.clearRect(croppingBox.x, croppingBox.y, croppingBox.width, croppingBox.height);

      // draw selection border
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 3;
      ctx.strokeRect(croppingBox.x, croppingBox.y, croppingBox.width, croppingBox.height);
    }

    const makeHandleMouseMove = useCallback((corner: string) => {
      return function (e: MouseEvent) {
        switch (corner) {
          case 'topleft':
            setCroppingRect(prev => ({
              ...prev,
              startx: Math.floor(e.offsetX),
              starty: Math.floor(e.offsetY),
            }));
            break;
          case 'topright':
            setCroppingRect(prev => ({
              ...prev,
              endx: Math.floor(e.offsetX),
              starty: Math.floor(e.offsetY),
            }));
            break;
          case 'bottomleft':
            setCroppingRect(prev => ({
              ...prev,
              startx: Math.floor(e.offsetX),
              endy: Math.floor(e.offsetY),
            }));
            break;
          case 'bottomright':
            setCroppingRect(prev => ({
              ...prev,
              endx: Math.floor(e.offsetX),
              endy: Math.floor(e.offsetY),
            }));
            break;
        }
      };
    }, []);

    function onGrabButton(e: Event, corner: string): void {
      setConfirmCrop(false);
      const handleMouseMove = makeHandleMouseMove(corner);
      const handleMouseUp = (): void => {
        croppingRef.current && croppingRef.current.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
        setConfirmCrop(true);
      };

      DOCUMENT.addEventListener('mouseup', handleMouseUp);
      croppingRef.current && croppingRef.current.addEventListener('mousemove', handleMouseMove);
    }

    useEffect(() => {
      refreshCroppingBox();
    }, [croppingRect]);

    function submit(): void {
      const cutoutCanvas = DOCUMENT.createElement('canvas');
      const imageBox = constructRect(containedImage(imageBuffer));
      const croppingBox = constructRect(croppingRect);
      cutoutCanvas.width = croppingBox.width;
      cutoutCanvas.height = croppingBox.height;

      const cutoutCtx = cutoutCanvas.getContext('2d');
      if (cutoutCtx && imageBuffer) {
        cutoutCtx.drawImage(
          imageBuffer,
          ((croppingBox.x - imageBox.x) / imageBox.width) * imageBuffer.width,
          ((croppingBox.y - imageBox.y) / imageBox.height) * imageBuffer.height,
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
        setCroppingRect(containedImage(imageBuffer));
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
          context.drawImage(imageSource, 0, 0, imageSource.videoWidth, imageSource.videoHeight);
        },
        [imageBuffer],
      ),
      onAfterScreenshot: useCallback(() => {
        dialog.el.style.display = 'block';
        setCroppingRect(containedImage(imageBuffer));
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
          <canvas style={{ position: 'absolute' }} ref={croppingRef}></canvas>
          <CropCorner
            left={croppingRect.startx - 3}
            top={croppingRect.starty - 3}
            onGrabButton={onGrabButton}
            corner="topleft"
          ></CropCorner>
          <CropCorner
            left={croppingRect.endx - 30 + 3}
            top={croppingRect.starty - 3}
            onGrabButton={onGrabButton}
            corner="topright"
          ></CropCorner>
          <CropCorner
            left={croppingRect.startx - 3}
            top={croppingRect.endy - 30 + 3}
            onGrabButton={onGrabButton}
            corner="bottomleft"
          ></CropCorner>
          <CropCorner
            left={croppingRect.endx - 30 + 3}
            top={croppingRect.endy - 30 + 3}
            onGrabButton={onGrabButton}
            corner="bottomright"
          ></CropCorner>
          <div
            style={{
              position: 'absolute',
              left: croppingRect.endx - 191,
              top: croppingRect.endy + 8,
              display: confirmCrop ? 'flex' : 'none',
            }}
            class="crop-btn-group"
          >
            <button
              onClick={e => {
                e.preventDefault();
                setCroppingRect(containedImage(imageBuffer));
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
      style={{
        width: 30,
        height: 30,
        position: 'absolute',
        top: top,
        left: left,
        background: 'none',
        borderTop: corner === 'topleft' || corner === 'topright' ? 'solid purple' : 'none',
        borderLeft: corner === 'topleft' || corner === 'bottomleft' ? 'solid purple' : 'none',
        borderRight: corner === 'topright' || corner === 'bottomright' ? 'solid purple' : 'none',
        borderBottom: corner === 'bottomleft' || corner === 'bottomright' ? 'solid purple' : 'none',
        borderWidth: '3px',
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
