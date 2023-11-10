import { WINDOW } from '@sentry/browser';

import { ImageEditor } from '../../util/imageEditor';
import { Arrow, Pen, Rectangle } from '../../util/imageEditor/tool';
import { createElement } from '../util/createElement';
import type { IconComponent} from './icons';
import { ArrowIcon, HandIcon, PenIcon, RectangleIcon } from './icons';

export type ToolKey = 'arrow' | 'pen' | 'rectangle' | 'hand';
export const Tools: ToolKey[] = ['arrow', 'pen', 'rectangle', 'hand'];
export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface ScreenshotAnnotatorProps {
  onCancel: () => void;
  onSubmit: (screenshot: Blob) => void;
}

const iconMap: Record<NonNullable<ToolKey>, () => IconComponent> = {
  arrow: ArrowIcon,
  pen: PenIcon,
  rectangle: RectangleIcon,
  hand: HandIcon,
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

const srcToImage = (src: string): HTMLImageElement => {
  const image = new Image();
  image.src = src;
  return image;
};

function ToolIcon({ tool }: { tool: ToolKey | null }) {
  const Icon = tool ? iconMap[tool] : HandIcon;
  return Icon();
}

const DEFAULT_COLOR = '#ff7738';

/**
 *
 */
export function ScreenshotAnnotator({ onCancel, onSubmit }: ScreenshotAnnotatorProps) {
  let editor: ImageEditor | null = null;

  const canvas = createElement('canvas', { className: '.screenshot-annotator__canvas' });
  const wrapper = createElement('div', { className: 'screenshot-annotator__canvas__wrapper' }, canvas);
  const tools = new Map<ToolKey, HTMLButtonElement>(
    Tools.map(tool => [
      tool,
      createElement(
        'button',
        { className: 'screenshot-annotator__tool-button', onClick: () => setSelectedTool(tool) },
        ToolIcon({ tool }).el,
      ),
    ]),
  );

  const toolbarGroupTools = createElement(
    'div',
    { className: 'screenshot-annotator__toolbar__group' },
    Array.from(tools.values()),
  );
  const colorDisplay = createElement('div', {
    className: 'screenshot-annotator__color-display',
    style: `background-color: ${DEFAULT_COLOR}`,
  });

  const colorInput = createElement('input', {
    type: 'color',
    value: DEFAULT_COLOR,
    onChange: (e: Event): void => {
      e.target && setSelectedColor((e.target as HTMLInputElement).value);
    },
  });

  const colorInputLabel = createElement(
    'label',
    {
      className: 'screenshot-annotator__color-input',
    },
    colorDisplay,
    colorInput,
  );
  const toolbarGroupColor = createElement(
    'div',
    { className: 'screenshot-annotator__toolbar__group' },
    colorInputLabel,
  );
  const toolbar = createElement(
    'div',
    { className: 'screenshot-annotator__toolbar' },
    createElement('button', { className: 'screenshot-annotator__cancel', onClick: onCancel }, 'Cancel'),
    createElement('div', {}, toolbarGroupTools, toolbarGroupColor),
    createElement('button', { className: 'screenshot-annotator__submit', onClick: handleSubmit }, 'Save'),
  );

  const el = createElement(
    'div',
    {
      className: 'screenshot-annotator__container',
      'aria-hidden': 'true',
      onClick: (e: Event) => {
        e.stopPropagation();
      },
    },
    wrapper,
    toolbar,
  );

  const resizeCanvas = () => {
    if (!canvas) {
      return;
    }
    // fit canvas to window
    const { width, height } = getCanvasRenderSize(canvas, wrapper);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  };

  WINDOW.addEventListener('resize', resizeCanvas);

  /**
   *
   */
  async function handleSubmit(): Promise<void> {
    if (!editor) {
      return;
    }

    const blob = await editor.getBlob();

    if (!blob) {
      return;
    }

    onSubmit(blob);
  }
  /**
   *
   */
  function setSelectedColor(color: string) {
    if (!editor) {
      return;
    }

    editor.color = color;
    colorDisplay.setAttribute('style', `background-color: ${color};`);
    colorInput.value = color;
  }

  /**
   *
   */
  function setSelectedTool(tool: ToolKey) {
    if (!editor) {
      return;
    }

    // if (activeTool) {
    //   // activeTool.
    // }

    const activeTools = toolbarGroupTools.querySelectorAll('.screenshot-annotator__tool-button--active');
    activeTools.forEach(activeTool => {
      activeTool.classList.remove('screenshot-annotator__tool-button--active');
    });

    const toolEl = tools.get(tool);
    if (toolEl) {
      toolEl.classList.add('screenshot-annotator__tool-button--active');
    }

    switch (tool) {
      case 'arrow':
        editor.tool = new Arrow();
        break;
      case 'pen':
        editor.tool = new Pen();
        break;
      case 'rectangle':
        editor.tool = new Rectangle();
        break;
      default:
        editor.tool = null;
        break;
    }
  }

  return {
    get el() {
      return el;
    },
    remove() {
      WINDOW.removeEventListener('resize', resizeCanvas);
    },
    show(src: string) {
      editor = new ImageEditor({ canvas, image: srcToImage(src), onLoad: resizeCanvas });
      editor.tool = new Arrow();
      editor.color = '#ff7738';
      editor.strokeSize = 6;
      el.setAttribute('aria-hidden', 'false');
    },
    hide() {
      el.setAttribute('aria-hidden', 'true');
    },
  };
}
