import { WINDOW } from '@sentry/browser';
import { IDrawing, ITool, Rect } from './types';
import { Point, translateBoundingBoxToDocument, translateMouseEvent, translatePointToCanvas } from './utils';

interface Options {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement;
  onLoad?: () => void;
}

const doc = WINDOW.document;

class Resizer {
  private boundingBox: Rect;
  private box: HTMLDivElement;
  private isDragging: boolean = false;
  private isDraggingHandle: boolean = false;

  constructor(boundingBox: Rect, onDrag?: (event: MouseEvent) => void, onResize?: (event: MouseEvent) => void) {
    this.boundingBox = boundingBox;

    const box = doc.createElement('div');
    this.box = box;
    doc.body.appendChild(box);

    const horizontalDashedGradient = `repeating-linear-gradient(
      to right,
      white,
      white 5px,
      black 5px,
      black 10px
    )`;
    const verticalDashedGradient = `repeating-linear-gradient(
      to bottom,
      white,
      white 5px,
      black 5px,
      black 10px
    )`;

    const topBorder = doc.createElement('div');
    topBorder.style.position = 'absolute';
    topBorder.style.width = 'calc(100% + 16px)';
    topBorder.style.height = '2px';
    topBorder.style.top = '-8px';
    topBorder.style.left = '-8px';
    topBorder.style.backgroundImage = horizontalDashedGradient;

    const bottomBorder = doc.createElement('div');
    bottomBorder.style.position = 'absolute';
    bottomBorder.style.width = 'calc(100% + 16px)';
    bottomBorder.style.height = '2px';
    bottomBorder.style.bottom = '-8px';
    bottomBorder.style.left = '-8px';
    bottomBorder.style.backgroundImage = horizontalDashedGradient;

    this.box.appendChild(topBorder);
    this.box.appendChild(bottomBorder);

    const leftBorder = doc.createElement('div');
    leftBorder.style.position = 'absolute';
    leftBorder.style.height = 'calc(100% + 16px)';
    leftBorder.style.width = '2px';
    leftBorder.style.top = '-8px';
    leftBorder.style.left = '-8px';
    leftBorder.style.backgroundImage = verticalDashedGradient;

    const rightBorder = doc.createElement('div');
    rightBorder.style.position = 'absolute';
    rightBorder.style.height = 'calc(100% + 16px)';
    rightBorder.style.width = '2px';
    rightBorder.style.top = '-8px';
    rightBorder.style.right = '-8px';
    rightBorder.style.backgroundImage = verticalDashedGradient;

    this.box.appendChild(leftBorder);
    this.box.appendChild(rightBorder);

    const handle = doc.createElement('div');
    handle.style.position = 'absolute';
    handle.style.width = '10px';
    handle.style.height = '10px';
    handle.style.borderRadius = '50%';
    handle.style.backgroundColor = 'white';
    handle.style.border = '2px solid black';
    handle.style.right = '-12px';
    handle.style.bottom = '-12px';
    handle.style.cursor = 'nwse-resize';
    handle.addEventListener('mousedown', e => {
      e.stopPropagation();
      this.isDraggingHandle = true;
    });
    this.box.appendChild(handle);

    this.box.addEventListener('mousedown', () => {
      this.isDragging = true;
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.isDraggingHandle = false;
    });

    window.addEventListener('mousemove', e => {
      if (this.isDragging) {
        onDrag?.(e);
      }
      if (this.isDraggingHandle) {
        onResize?.(e);
      }
    });

    this.updateStyles();
  }

  destroy() {
    this.box.remove();
  }

  move(x: number, y: number) {
    this.boundingBox = {
      ...this.boundingBox,
      x: this.boundingBox.x + x,
      y: this.boundingBox.y + y,
    };
    this.updateStyles();
  }

  resize(x: number, y: number) {
    this.boundingBox = {
      ...this.boundingBox,
      width: this.boundingBox.width + x,
      height: this.boundingBox.height + y,
    };
    this.updateStyles();
  }

  private updateStyles() {
    this.box.style.position = 'fixed';
    this.box.style.zIndex = '90000';
    this.box.style.width = `${Math.abs(this.boundingBox.width)}px`;
    this.box.style.height = `${Math.abs(this.boundingBox.height)}px`;
    this.box.style.left = `${this.boundingBox.x}px`;
    this.box.style.top = `${this.boundingBox.y}px`;
    this.box.style.cursor = 'move';
    this.box.style.transformOrigin = 'top left';

    if (this.boundingBox.width < 0 && this.boundingBox.height < 0) {
      this.box.style.transform = 'scale(-1)';
    } else if (this.boundingBox.width < 0) {
      this.box.style.transform = 'scaleX(-1)';
    } else if (this.boundingBox.height < 0) {
      this.box.style.transform = 'scaleY(-1)';
    } else {
      this.box.style.transform = 'none';
    }
  }
}

const SCALEING_BASE = 1000 * 1000;

const getScaling = (width: number, height: number) => {
  const area = width * height;
  return Math.max(Math.sqrt(area / SCALEING_BASE), 1);
};

export class ImageEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawings: IDrawing[] = [];
  private scheduledFrame: number | null = null;
  private image: HTMLImageElement;
  private isInteractive: boolean = false;
  private selectedDrawingId: string | null = null;
  private resizer: Resizer | null = null;
  private drawingScaling: number = 1;
  private _tool: ITool | null = null;
  private _color: string = '#79628c';
  private _strokeSize: number = 6;

  constructor(options: Options) {
    const { canvas, image, onLoad } = options;
    this.canvas = canvas;
    this.image = image;
    this.ctx = canvas.getContext('2d');

    if (image.complete) {
      this.isInteractive = true;
      this.canvas.width = image.width;
      this.canvas.height = image.height;
      this.drawingScaling = getScaling(image.width, image.height);
      this.sheduleUpdateCanvas();
      onLoad?.();
    } else {
      image.addEventListener('load', () => {
        this.isInteractive = true;
        this.canvas.width = image.width;
        this.canvas.height = image.height;
        this.drawingScaling = getScaling(image.width, image.height);
        this.sheduleUpdateCanvas();
        onLoad();
      });
    }

    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('keydown', this.handleDelete);
  }

  destroy() {
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('keydown', this.handleDelete);
    this.resizer?.destroy();
    this.drawings = [];
  }

  set tool(tool: ITool | null) {
    if (this._tool?.isDrawing) {
      // end the current drawing and discard it
      this._tool.endDrawing(Point.fromNumber(0));
    }
    this._tool = tool;
    // TODO(arthur): where to place this?
    this.canvas.style.cursor = this._tool ? 'crosshair' : 'grab';
  }

  get tool(): ITool | null {
    return this._tool;
  }

  set color(color: string) {
    this._color = color;
    if (this.selectedDrawingId) {
      const selectedDrawing = this.drawings.find(d => d.id === this.selectedDrawingId);
      selectedDrawing?.setColor(color);
      this.sheduleUpdateCanvas();
    }
  }

  get color(): string {
    return this._color;
  }

  set strokeSize(strokeSize: number) {
    this._strokeSize = strokeSize;
    if (this.selectedDrawingId) {
      const selectedDrawing = this.drawings.find(d => d.id === this.selectedDrawingId);
      selectedDrawing?.setStrokeSize(strokeSize);
    }
  }

  get strokeSize(): number {
    return this._strokeSize;
  }

  private updateCanvas = () => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    this.drawings.forEach(drawing => {
      drawing.drawToCanvas(this.ctx, drawing.id === this.selectedDrawingId);
    });
    if (this._tool?.isDrawing) {
      const drawing = this._tool.getDrawingBuffer();
      if (drawing) {
        drawing.drawToCanvas(this.ctx, false);
      }
    }
  };

  private sheduleUpdateCanvas = () => {
    if (this.scheduledFrame) {
      cancelAnimationFrame(this.scheduledFrame);
    }
    this.scheduledFrame = requestAnimationFrame(this.updateCanvas);
  };

  private handleClick = (e: MouseEvent) => {
    if (this._tool || !this.isInteractive) {
      return;
    }
    const point = translateMouseEvent(e, this.canvas);
    const drawing = [...this.drawings].reverse().find(d => d.isInPath(this.ctx, point));
    this.selectedDrawingId = drawing?.id;
    this.sheduleUpdateCanvas();
    this.resizer?.destroy();
    this.resizer = null;
    if (drawing) {
      const boundingBox = drawing.getBoundingBox();
      this.resizer = new Resizer(
        translateBoundingBoxToDocument(boundingBox, this.canvas),
        this.handleDrag,
        this.handleResize,
      );
    }
  };

  private handleDelete = (e: KeyboardEvent) => {
    if (!this.selectedDrawingId || !['Delete', 'Backspace'].includes(e.key)) {
      return;
    }
    this.drawings = this.drawings.filter(d => d.id !== this.selectedDrawingId);
    this.selectedDrawingId = null;
    this.resizer?.destroy();
    this.resizer = null;
    this.sheduleUpdateCanvas();
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (!this._tool || this._tool.isDrawing || !this.isInteractive) {
      return;
    }
    this._tool.startDrawing(translateMouseEvent(e, this.canvas), this._color, this.drawingScaling);
    this.sheduleUpdateCanvas();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this._tool || !this._tool.isDrawing) {
      return;
    }
    this._tool.draw(translateMouseEvent(e, this.canvas));
    this.sheduleUpdateCanvas();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (!this._tool || !this._tool.isDrawing) {
      return;
    }
    const drawing = this._tool.endDrawing(translateMouseEvent(e, this.canvas));
    if (drawing) {
      this.drawings.push(drawing);
    }
    this.sheduleUpdateCanvas();
  };

  private handleDrag = (e: MouseEvent) => {
    const selectedDrawing = this.drawings.find(d => d.id === this.selectedDrawingId);
    if (!this.resizer || !this.selectedDrawingId) {
      return;
    }
    const delta = Point.fromNumber(e.movementX, e.movementY);
    selectedDrawing.moveBy(translatePointToCanvas(delta, this.canvas));
    this.resizer.move(e.movementX, e.movementY);
    this.sheduleUpdateCanvas();
  };

  private handleResize = (e: MouseEvent) => {
    const selectedDrawing = this.drawings.find(d => d.id === this.selectedDrawingId);
    if (!this.resizer || !this.selectedDrawingId) {
      return;
    }
    const delta = Point.fromNumber(e.movementX, e.movementY);
    selectedDrawing.scaleBy(translatePointToCanvas(delta, this.canvas));
    this.resizer.resize(e.movementX, e.movementY);
    this.sheduleUpdateCanvas();
  };

  public getDataURL = (): string => {
    return this.canvas.toDataURL();
  };

  public getBlob = (): Promise<Blob> => {
    return new Promise<Blob>(resolve => {
      this.canvas.toBlob(blob => {
        resolve(blob);
      });
    });
  };
}
