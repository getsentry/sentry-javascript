import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOCUMENT } from '../../constants';
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

interface Point {
  x: number;
  y: number;
}

interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

const constructRect = (start: Point, end: Point): Rect => {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  };
};

function drawIntoCanvas(imageSource: HTMLVideoElement, destination: HTMLCanvasElement): void {
  const context = destination.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  destination.width = imageSource.videoWidth;
  destination.height = imageSource.videoHeight;
  context.drawImage(imageSource, 0, 0, imageSource.videoWidth, imageSource.videoHeight);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeScreenshotEditorComponent({ h, imageBuffer, dialog }: FactoryParams): ComponentType<Props> {
  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cropperRef = useRef<HTMLCanvasElement>(null);

    const [rectStart, setRectStart] = useState({ x: 0, y: 0 });
    const [rectEnd, setRectEnd] = useState({ x: 0, y: 0 }); // width/height
    const [confirmCrop, setConfirmCrop] = useState(false);

    useTakeScreenshot({
      onBeforeScreenshot: useCallback(() => {
        dialog.el.style.display = 'none';
      }, []),
      onScreenshot: useCallback(
        (imageSource: HTMLVideoElement) => {
          drawIntoCanvas(imageSource, imageBuffer);

          if (canvasRef.current) {
            drawIntoCanvas(imageSource, canvasRef.current);
            setRectStart({ x: 0, y: 0 });
            setRectEnd({ x: imageSource.videoWidth, y: imageSource.videoHeight });
            const cropper = cropperRef.current;
            if (cropper) {
              cropper.width = imageSource.videoWidth;
              cropper.height = imageSource.videoHeight;
              cropper.style.width = `${imageSource.videoWidth}px`;
              cropper.style.height = `${imageSource.videoHeight}px`;
            }
          }
        },
        [imageBuffer],
      ),
      onAfterScreenshot: useCallback(() => {
        dialog.el.style.display = 'block';
        // resizeCropper();
      }, []),
      onError: useCallback(error => {
        dialog.el.style.display = 'block';
        onError(error);
      }, []),
    });

    // useEffect(() => {
    //   const ctx = canvasRef.current && canvasRef.current.getContext('2d');
    //   if (ctx) {
    //     ctx.drawImage(
    //       imageBuffer,
    //       0,
    //       0,
    //       imageBuffer.width,
    //       imageBuffer.height,
    //       0,
    //       0,
    //       imageBuffer.width,
    //       imageBuffer.height,
    //     );

    //     setRectStart({ x: 0, y: 0 });
    //     setRectEnd({ x: imageBuffer.width, y: imageBuffer.height });

    //     const cropper = cropperRef.current;
    //     if (cropper) {
    //       cropper.width = imageBuffer.offsetWidth;
    //       cropper.height = imageBuffer.offsetHeight;
    //       cropper.style.width = `${imageBuffer.offsetWidth}px`;
    //       cropper.style.height = `${imageBuffer.offsetHeight}px`;
    //     }
    //   }
    // }, [canvasRef.current]);

    // useEffect(() => {
    //   // const container = canvasContainerRef.current;
    //   // container && container.appendChild(imageBuffer);

    //   resizeCropper();
    // }, [imageBuffer]);

    // function resizeCropper(): void {
    //   setRectStart({ x: imageBuffer.offsetLeft, y: imageBuffer.offsetTop });
    //   setRectEnd({
    //     x: imageBuffer.offsetLeft + imageBuffer.offsetWidth,
    //     y: imageBuffer.offsetTop + imageBuffer.offsetHeight,
    //   });

    //   const cropper = cropperRef.current;
    //   if (cropper) {
    //     cropper.width = imageBuffer.offsetWidth;
    //     cropper.height = imageBuffer.offsetHeight;
    //     cropper.style.width = `${imageBuffer.offsetWidth}px`;
    //     cropper.style.height = `${imageBuffer.offsetHeight}px`;
    //   }
    // }

    function refreshCanvas(): void {
      const cropper = cropperRef.current;
      if (!cropper) {
        return;
      }
      const ctx = cropper.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, cropper.width, cropper.height);

      const rect = constructRect(rectStart, rectEnd);

      // draw gray overlay around the selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, imageBuffer.offsetWidth, imageBuffer.offsetHeight);
      ctx.clearRect(rect.x - imageBuffer.offsetLeft, rect.y - imageBuffer.offsetTop, rect.width, rect.height);

      // draw selection border
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.x - imageBuffer.offsetLeft, rect.y - imageBuffer.offsetTop, rect.width, rect.height);
    }

    const makeHandleMouseMove = useCallback((corner: string) => {
      return function (e: MouseEvent) {
        switch (corner) {
          case 'topleft':
            setRectStart({
              x: imageBuffer.offsetLeft + Math.floor(e.offsetX),
              y: imageBuffer.offsetTop + Math.floor(e.offsetY),
            });
            break;
          case 'topright':
            setRectStart(prev => ({ ...prev, y: imageBuffer.offsetTop + Math.floor(e.offsetY) }));
            setRectEnd(prev => ({ ...prev, x: imageBuffer.offsetLeft + Math.floor(e.offsetX) }));
            break;
          case 'bottomleft':
            setRectStart(prev => ({ ...prev, x: imageBuffer.offsetLeft + Math.floor(e.offsetX) }));
            setRectEnd(prev => ({ ...prev, y: imageBuffer.offsetTop + Math.floor(e.offsetY) }));
            break;
          case 'bottomright':
            setRectEnd({
              x: imageBuffer.offsetLeft + Math.floor(e.offsetX),
              y: imageBuffer.offsetTop + Math.floor(e.offsetY),
            });
            break;
        }
      };
    }, []);

    function onGrabButton(e: Event, corner: string): void {
      setConfirmCrop(false);
      const handleMouseMove = makeHandleMouseMove(corner);
      const handleMouseUp = (): void => {
        imageBuffer.removeEventListener('mousemove', handleMouseMove);
        cropperRef.current && cropperRef.current.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
        setConfirmCrop(true);
      };

      DOCUMENT.addEventListener('mouseup', handleMouseUp);
      imageBuffer.addEventListener('mousemove', handleMouseMove);
      cropperRef.current && cropperRef.current.addEventListener('mousemove', handleMouseMove);
    }

    useEffect(() => {
      refreshCanvas();
    }, [rectStart, rectEnd]);

    function submit(): void {
      const rect = constructRect(rectStart, rectEnd);

      // const cutoutCanvas = DOCUMENT.createElement('canvas');

      // (image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number)

      const imagebufferCtx = imageBuffer.getContext('2d');
      if (imagebufferCtx) {
        imagebufferCtx.drawImage(
          imageBuffer,
          ((rect.x - imageBuffer.offsetLeft) / imageBuffer.offsetWidth) * imageBuffer.width,
          ((rect.y - imageBuffer.offsetTop) / imageBuffer.offsetHeight) * imageBuffer.height,
          (rect.width / imageBuffer.offsetWidth) * imageBuffer.width,
          (rect.height / imageBuffer.offsetHeight) * imageBuffer.height,
          0,
          0,
          rect.width,
          rect.height,
        );
        imageBuffer.width = rect.width;
        imageBuffer.height = rect.height;
      }
      // resizeCropper();
      // const container = canvasContainerRef.current;
      // container && container.removeChild(imageBuffer);
    }

    return (
      <div class="editor">
        <style dangerouslySetInnerHTML={styles} />
        <div class="canvasContainer" ref={canvasContainerRef}>
          <canvas ref={canvasRef}></canvas>
          <canvas ref={cropperRef}></canvas>
          <div>
            <CropCorner
              left={rectStart.x - 3}
              top={rectStart.y - 3}
              onGrabButton={onGrabButton}
              corner="topleft"
            ></CropCorner>
            <CropCorner
              left={rectEnd.x - 30 + 3}
              top={rectStart.y - 3}
              onGrabButton={onGrabButton}
              corner="topright"
            ></CropCorner>
            <CropCorner
              left={rectStart.x - 3}
              top={rectEnd.y - 30 + 3}
              onGrabButton={onGrabButton}
              corner="bottomleft"
            ></CropCorner>
            <CropCorner
              left={rectEnd.x - 30 + 3}
              top={rectEnd.y - 30 + 3}
              onGrabButton={onGrabButton}
              corner="bottomright"
            ></CropCorner>

            <div
              style={{
                position: 'absolute',
                left: rectEnd.x - 191,
                top: rectEnd.y + 8,
                display: confirmCrop ? 'flex' : 'none',
              }}
              class="crop-btn-group"
            >
              <button
                onClick={e => {
                  e.preventDefault();
                  setRectStart({ x: imageBuffer.offsetLeft, y: imageBuffer.offsetTop });
                  setRectEnd({
                    x: imageBuffer.offsetLeft + imageBuffer.offsetWidth,
                    y: imageBuffer.offsetTop + imageBuffer.offsetHeight,
                  });
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
