import type { ComponentType, VNode, h as hType } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { createScreenshotInputStyles } from './ScreenshotInput.css';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeInput(h: typeof hType, canvasEl: HTMLCanvasElement): ComponentType {
  return function ScreenshotToggle(): VNode {
    const styles = useMemo(() => ({ __html: createScreenshotInputStyles().innerText }), []);

    const canvasContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const container = canvasContainerRef.current;
      container && container.appendChild(canvasEl);
      return () => container && container.removeChild(canvasEl);
    }, [canvasEl]);

    return (
      <div class="editor">
        <style dangerouslySetInnerHTML={styles} />
        <input type="text" />
        <div ref={canvasContainerRef} style={{ display: 'none' }} />
      </div>
    );
  };
}
