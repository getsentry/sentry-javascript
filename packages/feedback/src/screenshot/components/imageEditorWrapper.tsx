import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { h } from 'preact';
import type { ToolKey } from './useImageEditor';
import { Tools, useImageEditor } from './useImageEditor';
import { ArrowIcon, HandIcon, RectangleIcon } from './useImageEditor/icons';
import { WINDOW } from './../../constants';
import type { ComponentType } from 'preact';
import { createScreenshotAnnotateStyles } from './imageEditorWrapper.css';

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface ImageEditorWrapperProps {
  onCancel: () => void;
  onSubmit: (screenshot: HTMLCanvasElement | null) => void;
  src: HTMLCanvasElement;
}

const iconMap: Record<ToolKey, ComponentType> = {
  arrow: ArrowIcon,
  rectangle: RectangleIcon,
  select: HandIcon,
};

const getCanvasRenderSize = (canvas: HTMLCanvasElement, containerElement: HTMLDivElement) => {
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  const maxWidth = containerElement.getBoundingClientRect().width;
  const maxHeight = containerElement.getBoundingClientRect().height;
  // fit canvas to window
  let width = canvasWidth;
  let height = canvasHeight;
  const canvasRatio = canvasWidth / canvasHeight;
  const windowRatio = maxWidth / maxHeight;

  if (canvasRatio > windowRatio && canvasWidth > maxWidth) {
    height = (maxWidth / canvasWidth) * canvasHeight;
    width = maxWidth;
  }

  if (canvasRatio < windowRatio && canvasHeight > maxHeight) {
    width = (maxHeight / canvasHeight) * canvasWidth;
    height = maxHeight;
  }

  return { width, height };
};

function ToolIcon({ tool }: { tool: ToolKey }) {
  const Icon = tool ? iconMap[tool] : HandIcon;
  return <Icon />;
}

export function ImageEditorWrapper({ src, onCancel, onSubmit }: ImageEditorWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const styles = useMemo(() => ({ __html: createScreenshotAnnotateStyles().innerText }), []);

  const resizeCanvas = useCallback(() => {
    if (!canvas || !wrapperRef.current) {
      return;
    }
    // fit canvas to window
    const { width, height } = getCanvasRenderSize(canvas, wrapperRef.current);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [canvas]);

  const { selectedTool, setSelectedTool, selectedColor, setSelectedColor, getBlob } = useImageEditor({
    canvas,
    image: src,
    onLoad: resizeCanvas,
  });

  useEffect(() => {
    resizeCanvas();
    WINDOW.addEventListener('resize', resizeCanvas);
    return () => {
      WINDOW.removeEventListener('resize', resizeCanvas);
    };
  }, [resizeCanvas]);

  return (
    <div>
      <style dangerouslySetInnerHTML={styles} />
      <div class="container">
        <div class="canvasWrapper" ref={wrapperRef}>
          <canvas class="canvas" ref={setCanvas} />
        </div>
        <div class="toolbar">
          <button class="btn btn--default" onClick={() => onCancel()}>
            Cancel
          </button>
          <div class="flexSpacer" />
          <div class="toolbarGroup">
            {Tools.map(tool => (
              <button
                class={`btn ${tool === selectedTool ? 'btn--primary' : 'btn--default'}`}
                key={tool}
                onClick={e => {
                  e.preventDefault();
                  setSelectedTool(tool);
                }}
              >
                <ToolIcon tool={tool} />
              </button>
            ))}
          </div>
          <div class="toolbarGroup">
            <label class="colorInput">
              <div
                class="colorDisplay"
                // color={selectedColor}
              />
              <input
                type="color"
                value={selectedColor}
                // onChange={e => setSelectedColor(e?.target?.value)}
              />
            </label>
          </div>
          <div />
          <button class="btn btn--primary" onClick={async () => onSubmit(canvas)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
