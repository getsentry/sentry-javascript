import type { ComponentType, VNode, h as hType } from 'preact';
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import type { Dialog } from '../../types';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import { useTakeScreenshot } from './useTakeScreenshot';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeInput(h: typeof hType, canvas: HTMLCanvasElement, dialog: Dialog): ComponentType {
  return function ScreenshotToggle(): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const container = canvasContainerRef.current;
      container && container.appendChild(canvas);
      return () => container && container.removeChild(canvas);
    }, [canvas]);

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
          context.drawImage(imageSource, 0, 0);
        },
        [canvas],
      ),
      onAfterScreenshot: useCallback(() => {
        dialog.el.style.display = 'block';
      }, []),
    });

    return (
      <div class="editor">
        <style dangerouslySetInnerHTML={styles} />
        <div class="canvasContainer" ref={canvasContainerRef} />
      </div>
    );
  };
}
