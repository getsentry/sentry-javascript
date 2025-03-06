import type { VNode, h as hType } from 'preact';
import type * as Hooks from 'preact/hooks';
import { DOCUMENT } from '../../constants';

interface FactoryParams {
  h: typeof hType;
}

export default function AnnotationsFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function Annotations({
    action,
    imageBuffer,
    annotatingRef,
  }: {
    action: 'crop' | 'annotate' | '';
    imageBuffer: HTMLCanvasElement;
    annotatingRef: Hooks.Ref<HTMLCanvasElement>;
  }): VNode {
    const onAnnotateStart = (): void => {
      if (action !== 'annotate') {
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
        if (ctx) {
          ctx.beginPath();
        }

        // Add your apply annotation logic here
        applyAnnotation();

        DOCUMENT.removeEventListener('mousemove', handleMouseMove);
        DOCUMENT.removeEventListener('mouseup', handleMouseUp);
      };

      DOCUMENT.addEventListener('mousemove', handleMouseMove);
      DOCUMENT.addEventListener('mouseup', handleMouseUp);
    };

    const applyAnnotation = (): void => {
      // Logic to apply the annotation
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

        const annotateCtx = annotateCanvas.getContext('2d');
        if (annotateCtx) {
          annotateCtx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height);
        }
      }
    };
    return (
      <canvas
        class={`editor__annotation ${action === 'annotate' ? 'editor__annotation--active' : ''}`}
        onMouseDown={onAnnotateStart}
        ref={annotatingRef}
      ></canvas>
    );
  };
}
