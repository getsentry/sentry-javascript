import type { ComponentType, VNode, h as hType } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface Props {
  initialImage: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeInput(h: typeof hType, canvasEl: HTMLCanvasElement): ComponentType<Props> {
  return function ScreenshotToggle({ initialImage }: Props): VNode {
    console.log({ initialImage, canvasEl }); // eslint-disable-line no-console

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const container = canvasContainerRef.current;
      container && container.appendChild(canvasEl);
      return () => container && container.removeChild(canvasEl);
    }, [canvasEl]);

    return (
      <div class="editor">
        <input type="text" />
        <div ref={canvasContainerRef} style={{ display: 'none' }} />
      </div>
    );
  };
}
