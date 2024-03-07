import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DOCUMENT } from '../../constants';
import type { Dialog } from '../../types';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useContainerSize } from './useContainerSize';
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
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  height: number;
  width: number;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

const constructRect = (start: Point, end: Point): Rect => {
  return {
    sx: Math.min(start.x, end.x),
    sy: Math.min(start.y, end.y),
    ex: Math.max(start.x, end.x),
    ey: Math.max(start.y, end.y),
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
    const divRef = useRef<HTMLDivElement>(null);

    const containerSize = useContainerSize(canvasContainerRef);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
      if (!canvasRef.current) {
        return;
      }
      canvasRef.current.style.width = `${containerSize.width}px`;
      canvasRef.current.style.height = `${containerSize.height}px`;
    }, [canvasRef.current, containerSize]);

    const [rectStart, setRectStart] = useState({ x: 0, y: 0 });
    const [rectEnd, setRectEnd] = useState({ x: containerSize.width, y: containerSize.height });
    const rect = useMemo(() => constructRect(rectStart, rectEnd), [rectStart, rectEnd]);

    const [confirmCrop, setConfirmCrop] = useState(false);

    useEffect(() => {
      if (!cropperRef.current || !divRef.current) {
        return;
      }
      const cropper = cropperRef.current;

      const widthRatio = imageSize.width / containerSize.width;
      const heightRatio = imageSize.height / containerSize.height;
      if (widthRatio > heightRatio) {
        cropper.width = containerSize.width;
        cropper.height = Math.floor(imageSize.height / widthRatio);
      } else {
        cropper.width = Math.floor(imageSize.width / heightRatio);
        cropper.height = containerSize.height;
      }

      const ctx = cropper.getContext('2d');
      if (!ctx) {
        return;
      }

      // draw gray overlay around the selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, containerSize.width, containerSize.height);
      ctx.clearRect(rect.sx, rect.sy, rect.width, rect.height);

      // draw selection border
      ctx.strokeStyle = 'purple';
      ctx.lineWidth = 3;
      ctx.strokeRect(rect.sx, rect.sy, rect.width, rect.height);
    }, [rect, cropperRef.current, containerSize, imageSize]);

    useTakeScreenshot({
      onBeforeScreenshot: useCallback(() => {
        dialog.el.style.display = 'none';
      }, []),
      onScreenshot: useCallback(
        (imageSource: HTMLVideoElement) => {
          setImageSize({
            width: imageSource.videoWidth,
            height: imageSource.videoHeight,
          });
          drawIntoCanvas(imageSource, imageBuffer);

          if (canvasRef.current) {
            drawIntoCanvas(imageSource, canvasRef.current);

            if (divRef.current) {
              divRef.current.style.aspectRatio = `auto ${imageSource.videoWidth} / ${imageSource.videoHeight}`;
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

    const makeHandleMouseMove = useCallback((corner: string) => {
      return function (e: MouseEvent) {
        switch (corner) {
          case 'topleft':
            setRectStart({
              x: Math.max(0, e.offsetX), // but not larger than the width
              y: Math.max(0, e.offsetY),
            });
            break;
          case 'topright':
            setRectStart(prev => ({ ...prev, y: Math.floor(e.offsetY) }));
            setRectEnd(prev => ({ ...prev, x: Math.floor(e.offsetX) }));
            break;
          case 'bottomleft':
            setRectStart(prev => ({ ...prev, x: Math.floor(e.offsetX) }));
            setRectEnd(prev => ({ ...prev, y: Math.floor(e.offsetY) }));
            break;
          case 'bottomright':
            setRectEnd({
              x: Math.floor(e.offsetX),
              y: Math.floor(e.offsetY),
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

    function submit(): void {
      const imagebufferCtx = imageBuffer.getContext('2d');
      if (imagebufferCtx && canvasRef.current) {
        imageBuffer.width = rect.width;
        imageBuffer.height = rect.height;
        imagebufferCtx.drawImage(
          canvasRef.current,
          ((rect.sx - imageBuffer.offsetLeft) / imageBuffer.offsetWidth) * imageBuffer.width,
          ((rect.sy - imageBuffer.offsetTop) / imageBuffer.offsetHeight) * imageBuffer.height,
          (rect.width / imageBuffer.offsetWidth) * imageBuffer.width,
          (rect.height / imageBuffer.offsetHeight) * imageBuffer.height,
          0,
          0,
          rect.width,
          rect.height,
        );
      }
    }

    return (
      <div class="editor">
        <style dangerouslySetInnerHTML={styles} />
        <div class="canvasContainer" ref={canvasContainerRef}>
          <canvas ref={canvasRef} />
          <div ref={divRef}>
            <canvas class="cropper" ref={cropperRef} />
            <CropCorner left={rect.sx} top={rect.sy} onGrabButton={onGrabButton} corner="topleft"></CropCorner>
            <CropCorner
              left={Math.max(0, rect.ex - 30)}
              top={rect.sy}
              onGrabButton={onGrabButton}
              corner="topright"
            ></CropCorner>
            <CropCorner
              left={rect.sx}
              top={Math.max(0, rect.ey - 30)}
              onGrabButton={onGrabButton}
              corner="bottomleft"
            ></CropCorner>
            <CropCorner
              left={Math.max(0, rect.ex - 30)}
              top={Math.max(0, rect.ey - 30)}
              onGrabButton={onGrabButton}
              corner="bottomright"
            ></CropCorner>

            <div
              style={{
                position: 'absolute',
                left: rect.ex - 191,
                top: rect.ey + 8,
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
