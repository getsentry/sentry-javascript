import { WINDOW } from '@sentry/browser';
import { createElement } from '../util/createElement';
import { ScreenshotEditorHelp } from './screenshotEditorHelp';

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface ScreenshotEditorProps {
  dataUrl: string;
  onSubmit: (screenshot: Blob | null, cutout?: Blob | null, selection?: Rect) => void;
}

const getCanvasRenderSize = (width: number, height: number) => {
  const maxWidth = WINDOW.innerWidth;
  const maxHeight = WINDOW.innerHeight;

  if (width > maxWidth) {
    height = (maxWidth / width) * height;
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = (maxHeight / height) * width;
    height = maxHeight;
  }

  return { width, height };
};

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> => {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      resolve(blob);
    });
  });
};
interface Point {
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

export function ScreenshotEditor({ dataUrl, onSubmit }: ScreenshotEditorProps) {
  let currentRatio = 1;
  const canvas = createElement('canvas', { className: 'screenshot-editor' });
  const screenshotEditorHelp = ScreenshotEditorHelp();
  const el = createElement('div', { className: 'screenshot-editor__container' }, canvas, screenshotEditorHelp.el);

  const ctx = canvas.getContext('2d');
  const img = new Image();
  const rectStart: { x: number; y: number } = { x: 0, y: 0 };
  const rectEnd: { x: number; y: number } = { x: 0, y: 0 };
  let isDragging = false;

  function setCanvasSize(): void {
    const renderSize = getCanvasRenderSize(img.width, img.height);
    canvas.style.width = `${renderSize.width}px`;
    canvas.style.height = `${renderSize.height}px`;
    canvas.style.top = `${(WINDOW.innerHeight - renderSize.height) / 2}px`;
    canvas.style.left = `${(WINDOW.innerWidth - renderSize.width) / 2}px`;
    // store it so we can translate the selection
    currentRatio = renderSize.width / img.width;
  }

  function refreshCanvas(): void {
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    if (!isDragging) {
      return;
    }

    const rect = constructRect(rectStart, rectEnd);

    // draw gray overlay around the selectio
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, rect.y);
    ctx.fillRect(0, rect.y, rect.x, rect.height);
    ctx.fillRect(rect.x + rect.width, rect.y, canvas.width, rect.height);
    ctx.fillRect(0, rect.y + rect.height, canvas.width, canvas.height);

    // draw selection border
    ctx.strokeStyle = '#79628c';
    ctx.lineWidth = 6;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  async function submit(rect?: Rect): Promise<void> {
    const imageBlob = await canvasToBlob(canvas);
    if (!rect) {
      onSubmit(imageBlob);
      return;
    }
    const cutoutCanvas = WINDOW.document.createElement('canvas');
    cutoutCanvas.width = rect.width;
    cutoutCanvas.height = rect.height;
    const cutoutCtx = cutoutCanvas.getContext('2d');
    cutoutCtx && cutoutCtx.drawImage(canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const cutoutBlob = await canvasToBlob(cutoutCanvas);
    onSubmit(imageBlob, cutoutBlob, rect);
  }

  function handleMouseDown(e: MouseEvent): void {
    rectStart.x = Math.floor(e.offsetX / currentRatio);
    rectStart.y = Math.floor(e.offsetY / currentRatio);
    isDragging = true;
    screenshotEditorHelp.setHidden(true);
  }
  function handleMouseMove(e: MouseEvent): void {
    rectEnd.x = Math.floor(e.offsetX / currentRatio);
    rectEnd.y = Math.floor(e.offsetY / currentRatio);
    refreshCanvas();
  }
  function handleMouseUp(): void {
    isDragging = false;
    screenshotEditorHelp.setHidden(false);
    if (rectStart.x - rectEnd.x === 0 && rectStart.y - rectEnd.y === 0) {
      // no selection
      refreshCanvas();
      return;
    }
    void submit(constructRect(rectStart, rectEnd));
  }

  function handleEnterKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      void submit();
    }
  }

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    setCanvasSize();
    ctx && ctx.drawImage(img, 0, 0);
  };

  img.src = dataUrl;

  WINDOW.addEventListener('resize', setCanvasSize, { passive: true });
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  WINDOW.addEventListener('keydown', handleEnterKey);

  return {
    get el() {
      return el;
    },
    remove() {
      WINDOW.removeEventListener('resize', setCanvasSize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      WINDOW.removeEventListener('keydown', handleEnterKey);
      el.remove();
    },
  };
  //   (
  //   <Container>
  //     <Canvas ref={canvasRef} />
  //     <ScreenshotEditorHelp hide={isDraggingState} />
  //   </Container>
  // );
}
