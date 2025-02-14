import type { FeedbackInternalOptions, FeedbackModalIntegration } from '@sentry/core';
import type { ComponentType, VNode, h as hType } from 'preact';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type * as Hooks from 'preact/hooks';
import { WINDOW } from '../../constants';
import AnnotationsFactory from './Annotations';
import CropFactory from './Crop';
import { createScreenshotInputStyles } from './ScreenshotInput.css';
import ToolbarFactory from './Toolbar';
import { useTakeScreenshotFactory } from './useTakeScreenshot';

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

export function ScreenshotEditorFactory({
  h,
  hooks,
  imageBuffer,
  dialog,
  options,
}: FactoryParams): ComponentType<Props> {
  const useTakeScreenshot = useTakeScreenshotFactory({ hooks });
  const Toolbar = ToolbarFactory({ h });
  const Annotations = AnnotationsFactory({ h });
  const Crop = CropFactory({ h, hooks, options });

  return function ScreenshotEditor({ onError }: Props): VNode {
    const styles = hooks.useMemo(() => ({ __html: createScreenshotInputStyles(options.styleNonce).innerText }), []);

    const canvasContainerRef = hooks.useRef<HTMLDivElement>(null);
    const cropContainerRef = hooks.useRef<HTMLDivElement>(null);
    const annotatingRef = hooks.useRef<HTMLCanvasElement>(null);
    const croppingRef = hooks.useRef<HTMLCanvasElement>(null);
    const [action, setAction] = hooks.useState<'annotate' | 'crop' | ''>('crop');
    const [croppingRect, setCroppingRect] = hooks.useState<Box>({
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
    });

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
      const imageDimensions = getContainedSize(imageBuffer);

      resizeCanvas(croppingRef, imageDimensions);
      resizeCanvas(annotatingRef, imageDimensions);

      const cropContainer = cropContainerRef.current;
      if (cropContainer) {
        cropContainer.style.width = `${imageDimensions.width}px`;
        cropContainer.style.height = `${imageDimensions.height}px`;
      }

      setCroppingRect({ startX: 0, startY: 0, endX: imageDimensions.width, endY: imageDimensions.height });
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
            <Crop
              action={action}
              imageBuffer={imageBuffer}
              croppingRef={croppingRef}
              cropContainerRef={cropContainerRef}
              croppingRect={croppingRect}
              setCroppingRect={setCroppingRect}
              resize={resize}
            />
            <Annotations action={action} imageBuffer={imageBuffer} annotatingRef={annotatingRef} />
          </div>
        </div>
        {options._experiments.annotations && <Toolbar action={action} setAction={setAction} />}
      </div>
    );
  };
}
