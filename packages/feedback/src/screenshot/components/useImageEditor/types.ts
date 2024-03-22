export interface IPoint {
  x: number;
  y: number;
}

export interface IDrawing {
  id: string;
  isValid: boolean;
  draw: (point: IPoint) => void;
  drawToCanvas: (context: CanvasRenderingContext2D | null, isSelected: boolean) => void;
  end: (point: IPoint) => void;
  getBoundingBox: () => Rect;
  isInPath: (ctx: CanvasRenderingContext2D | null, point: IPoint) => boolean;
  moveBy: (point: IPoint) => void;
  scaleBy: (point: IPoint) => void;
  setColor: (color: string) => void;
  setStrokeScalingFactor: (scalingFactor: number) => void;
  setStrokeSize: (strokeSize: number) => void;
  start: (point: IPoint) => void;
}

export interface ITool {
  draw: (point: IPoint) => void;
  endDrawing: (point: IPoint) => IDrawing | null;
  getDrawingBuffer: () => IDrawing | null;
  isDrawing: boolean;
  startDrawing: (point: IPoint, color: string, scalingFactor: number) => void;
}

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
