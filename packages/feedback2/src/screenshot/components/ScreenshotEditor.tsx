import type { ComponentType, VNode, h as hType } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Dialog } from '../../types';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useTakeScreenshot } from './useTakeScreenshot';
import { DOCUMENT, WINDOW } from '../../constants';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h } from 'preact';

interface FactoryParams {
  h: typeof hType;
  canvas: HTMLCanvasElement;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeScreenshotEditorComponent({ h, canvas, dialog }: FactoryParams): ComponentType<Props> {
  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const cropperRef = useRef<HTMLCanvasElement>(null);
    const [rectStart, setRectStart] = useState({ x: 0, y: 0 });
    const [rectEnd, setRectEnd] = useState({ x: 0, y: 0 });
    const [confirmCrop, setConfirmCrop] = useState(false);

    useEffect(() => {
      const container = canvasContainerRef.current;
      container && container.appendChild(canvas);

      resizeCropper();
    }, [canvas]);

    function resizeCropper() {
      setRectStart({ x: canvas.offsetLeft, y: canvas.offsetTop });
      setRectEnd({ x: canvas.offsetLeft + canvas.offsetWidth, y: canvas.offsetTop + canvas.offsetHeight });

      const cropper = cropperRef.current;
      if (cropper) {
        cropper!.width = canvas.offsetWidth;
        cropper!.height = canvas.offsetHeight;
        cropper!.style.width = `${canvas.offsetWidth}px`;
        cropper!.style.height = `${canvas.offsetHeight}px`;
      }
    }

    function refreshCanvas() {
      const cropper = cropperRef.current;
      const ctx = cropper?.getContext('2d');
      if (cropper && ctx) {
        ctx.clearRect(0, 0, cropper.width, cropper.height);

        const rect = constructRect(rectStart, rectEnd);

        // draw gray overlay around the selection
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
        ctx.clearRect(rect.x - canvas.offsetLeft, rect.y - canvas.offsetTop, rect.width, rect.height);

        // draw selection border
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 4;
        ctx.strokeRect(rect.x - canvas.offsetLeft, rect.y - canvas.offsetTop, rect.width, rect.height);
      }
    }

    const makeHandleMouseMove = useCallback((corner: string) => {
      return function (e: MouseEvent) {
        switch (corner) {
          case 'topleft':
            setRectStart({
              x: canvas.offsetLeft + Math.floor(e.offsetX),
              y: canvas.offsetTop + Math.floor(e.offsetY),
            });
            break;
          case 'topright':
            setRectStart(prev => ({ ...prev, y: canvas.offsetTop + Math.floor(e.offsetY) }));
            setRectEnd(prev => ({ ...prev, x: canvas.offsetLeft + Math.floor(e.offsetX) }));
            break;
          case 'bottomleft':
            setRectStart(prev => ({ ...prev, x: canvas.offsetLeft + Math.floor(e.offsetX) }));
            setRectEnd(prev => ({ ...prev, y: canvas.offsetTop + Math.floor(e.offsetY) }));
            break;
          case 'bottomright':
            setRectEnd({
              x: canvas.offsetLeft + Math.floor(e.offsetX),
              y: canvas.offsetTop + Math.floor(e.offsetY),
            });
            break;
        }
      };
    }, []);

    function onGrabButton(e: Event, corner: string) {
      setConfirmCrop(false);
      const handleMouseMove = makeHandleMouseMove(corner);
      const handleMouseUp = () => {
        canvas?.removeEventListener('mousemove', handleMouseMove);
        cropperRef.current?.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT?.removeEventListener('mouseup', handleMouseUp);
        setConfirmCrop(true);
      };

      DOCUMENT?.addEventListener('mouseup', handleMouseUp);
      canvas?.addEventListener('mousemove', handleMouseMove);
      cropperRef.current?.addEventListener('mousemove', handleMouseMove);
    }

    useEffect(() => {
      refreshCanvas();
    }, [rectStart, rectEnd]);

    function submit() {
      const rect = constructRect(rectStart, rectEnd);

      const cutoutCanvas = DOCUMENT.createElement('canvas');
      cutoutCanvas.width = rect.width;
      cutoutCanvas.height = rect.height;

      const cutoutCtx = cutoutCanvas.getContext('2d');
      if (cutoutCtx && canvas) {
        cutoutCtx.drawImage(
          canvas,
          ((rect.x - canvas.offsetLeft) / canvas.offsetWidth) * canvas.width,
          ((rect.y - canvas.offsetTop) / canvas.offsetHeight) * canvas.height,
          (rect.width / canvas.offsetWidth) * canvas.width,
          (rect.height / canvas.offsetHeight) * canvas.height,
          0,
          0,
          rect.width,
          rect.height,
        );
      }
      const container = canvasContainerRef.current;
      container && container.removeChild(canvas);
      // eslint-disable-next-line no-param-reassign
      canvas = cutoutCanvas;
    }

    useTakeScreenshot({
      onBeforeScreenshot: useCallback(() => {
        dialog.el.style.display = 'none';
      }, []),
      onScreenshot: useCallback(
        (imageSource: HTMLVideoElement) => {
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Could not get canvas context');
          }
          canvas.width = imageSource.videoWidth;
          canvas.height = imageSource.videoHeight;
          context.drawImage(imageSource, 0, 0, imageSource.videoWidth, imageSource.videoHeight);
        },
        [canvas],
      ),
      onAfterScreenshot: useCallback(() => {
        dialog.el.style.display = 'block';
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
          <canvas style={{ position: 'absolute' }} ref={cropperRef}></canvas>
          <CropCorner
            left={rectStart.x}
            top={rectStart.y}
            onGrabButton={onGrabButton}
            corner="topleft"
            borderWidth="5px 0px 0px 5px"
          ></CropCorner>
          <CropCorner
            left={rectEnd.x - 30}
            top={rectStart.y}
            onGrabButton={onGrabButton}
            corner="topright"
            borderWidth="5px 5px 0px 0px"
          ></CropCorner>
          <CropCorner
            left={rectStart.x}
            top={rectEnd.y - 30}
            onGrabButton={onGrabButton}
            corner="bottomleft"
            borderWidth="0px 0px 5px 5px"
          ></CropCorner>
          <CropCorner
            left={rectEnd.x - 30}
            top={rectEnd.y - 30}
            onGrabButton={onGrabButton}
            corner="bottomright"
            borderWidth="0px 5px 5px 0px"
          ></CropCorner>
          <div
            style={{
              position: 'absolute',
              left: rectEnd.x,
              top: rectEnd.y,
              display: confirmCrop ? 'inline' : 'none',
            }}
          >
            <button
              onClick={e => {
                e.preventDefault();
                setRectStart({ x: canvas.offsetLeft, y: canvas.offsetTop });
                setRectEnd({ x: canvas.offsetLeft + canvas.offsetWidth, y: canvas.offsetTop + canvas.offsetHeight });
                setConfirmCrop(false);
              }}
            >
              Cancel
            </button>
            <button
              style={{
                background: 'purple',
              }}
              onClick={e => {
                e.preventDefault();
                submit();
                setConfirmCrop(false);
              }}
            >
              Submit
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
  borderWidth,
  onGrabButton,
}: {
  top: number;
  left: number;
  corner: string;
  borderWidth: string;
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
        borderWidth: borderWidth,
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
