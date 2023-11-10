import type { IDrawing, IPoint, ITool, Rect } from './types';
import { getPointsBoundingBox, Point, translateRect, updateBoundingBox, Vector } from './utils';

class Tool implements ITool {
  private DrawingConstructor: new () => IDrawing;
  private drawing: IDrawing | null = null;

  get isDrawing() {
    return this.drawing !== null;
  }

  constructor(DrawingConstructor: new () => IDrawing) {
    this.DrawingConstructor = DrawingConstructor;
  }

  startDrawing(point: IPoint, color: string, scalingFactor: number) {
    this.drawing = new this.DrawingConstructor();
    this.drawing.setStrokeScalingFactor(scalingFactor);
    this.drawing.setColor(color);
    this.drawing.start(point);
  }

  draw(point: IPoint) {
    if (!this.isDrawing) {
      throw new Error('Call startDrawing before calling draw');
    }
    this.drawing && this.drawing.draw(point);
  }
  endDrawing(point: IPoint) {
    if (!this.isDrawing) {
      throw new Error('Call startDrawing before calling endDrawing');
    }
    this.drawing && this.drawing.end(point);
    const drawing = this.drawing;
    this.drawing = null;
    return drawing;
  }
  getDrawingBuffer() {
    return this.drawing;
  }
}

class Drawing implements IDrawing {
  protected path = new Path2D();
  protected startPoint: IPoint;
  protected endPoint: IPoint;
  protected translate: IPoint;
  protected color = 'red';
  protected strokeSize = 6;
  protected strokeScalingFactor = 1;
  protected scalingFactorX = 1;
  protected scalingFactorY = 1;

  public id = Math.random().toString();

  constructor() {
    this.start = this.start.bind(this);
    this.draw = this.draw.bind(this);
    this.end = this.end.bind(this);
    this.isInPath = this.isInPath.bind(this);
    this.drawToCanvas = this.drawToCanvas.bind(this);
    this.getBoundingBox = this.getBoundingBox.bind(this);
    this.startPoint = { x: 0, y: 0 };
    this.endPoint = { x: 0, y: 0 };
    this.translate = { x: 0, y: 0 };
  }

  get isValid() {
    return true;
  }

  get topLeftPoint() {
    return Point.fromNumber(Math.min(this.startPoint.x, this.endPoint.x), Math.min(this.startPoint.y, this.endPoint.y));
  }

  get bottomRightPoint() {
    return Point.fromNumber(Math.max(this.startPoint.x, this.endPoint.x), Math.max(this.startPoint.y, this.endPoint.y));
  }

  start(point: IPoint): void {
    this.startPoint = point;
    this.endPoint = point;
  }

  draw(point: IPoint): void {
    this.endPoint = point;
  }

  end(point: IPoint): void {
    this.endPoint = point;
  }

  getBoundingBox() {
    const box = getPointsBoundingBox([
      Point.add(this.startPoint, this.translate),
      Point.add(this.endPoint, this.translate),
    ]);

    return {
      ...box,
      width: box.width * this.scalingFactorX,
      height: box.height * this.scalingFactorY,
    };
  }

  setStrokeScalingFactor(strokeScalingFactor: number) {
    this.strokeScalingFactor = strokeScalingFactor;
  }

  setColor(color: string) {
    this.color = color;
  }

  setStrokeSize(strokeSize: number) {
    this.strokeSize = strokeSize;
  }

  isInPath(context: CanvasRenderingContext2D, point: IPoint) {
    return this.withTransform(
      context,
      () =>
        // we check for multiple points to make selection easier
        context.isPointInStroke(this.path, point.x, point.y) ||
        context.isPointInStroke(this.path, point.x + this.strokeSize, point.y) ||
        context.isPointInStroke(this.path, point.x - this.strokeSize, point.y) ||
        context.isPointInStroke(this.path, point.x, point.y + this.strokeSize) ||
        context.isPointInStroke(this.path, point.x, point.y - this.strokeSize) ||
        context.isPointInStroke(this.path, point.x + this.strokeSize, point.y + this.strokeSize) ||
        context.isPointInStroke(this.path, point.x - this.strokeSize, point.y - this.strokeSize),
    );
  }

  private withTransform<T>(context: CanvasRenderingContext2D, callback: () => T): T {
    context.setTransform(
      this.scalingFactorX,
      0,
      0,
      this.scalingFactorY,
      this.translate.x + this.topLeftPoint.x * (1 - this.scalingFactorX),
      this.translate.y + this.topLeftPoint.y * (1 - this.scalingFactorY),
    );
    const result = callback();
    // Reset current transformation matrix to the identity matrix
    context.setTransform(1, 0, 0, 1, 0, 0);
    return result;
  }

  drawToCanvas(context: CanvasRenderingContext2D) {
    if (!this.isValid) {
      return;
    }

    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = this.color;
    context.lineWidth = this.strokeSize * this.strokeScalingFactor;

    this.withTransform(context, () => {
      context.stroke(this.path);
    });
  }

  scaleBy(delta: IPoint) {
    const originalWidth = this.topLeftPoint.x - this.bottomRightPoint.x;
    const originalHeight = this.topLeftPoint.y - this.bottomRightPoint.y;
    const currentWidth = originalWidth * this.scalingFactorX;
    const currentHeight = originalHeight * this.scalingFactorY;

    const newWidth = currentWidth - delta.x;
    const newHeight = currentHeight - delta.y;

    this.scalingFactorX = newWidth / originalWidth;
    this.scalingFactorY = newHeight / originalHeight;
  }

  moveBy(point: IPoint) {
    this.translate = Point.add(this.translate, point);
  }
}

class RectangleDrawing extends Drawing {
  get isValid() {
    return Point.distance(this.startPoint, this.endPoint) > 0;
  }

  draw = (point: IPoint) => {
    super.draw(point);
    this.endPoint = point;
    this.path = new Path2D();
    this.path.rect(
      this.startPoint.x,
      this.startPoint.y,
      this.endPoint.x - this.startPoint.x,
      this.endPoint.y - this.startPoint.y,
    );
  };
}

/**
 *
 */
export class Rectangle extends Tool {
  constructor() {
    super(RectangleDrawing);
  }
}

class PenDrawing extends Drawing {
  private lastPoint: IPoint;
  private boundingBox: Rect;

  constructor() {
    super();
    this.lastPoint = { x: 0, y: 0 };
    this.boundingBox = { height: 0, width: 0, x: 0, y: 0 };
  }
  getBoundingBox(): Rect {
    const rect = translateRect(this.boundingBox, this.translate);
    return {
      ...rect,
      width: rect.width * this.scalingFactorX,
      height: rect.height * this.scalingFactorY,
    };
  }

  get topLeftPoint() {
    return Point.fromNumber(this.boundingBox.x, this.boundingBox.y);
  }

  get bottomRightPoint() {
    return Point.fromNumber(this.boundingBox.x + this.boundingBox.width, this.boundingBox.y + this.boundingBox.height);
  }

  start = (point: IPoint) => {
    super.start(point);
    this.path.moveTo(point.x, point.y);
    this.lastPoint = point;
    this.boundingBox = getPointsBoundingBox([point]);
  };

  draw = (point: IPoint) => {
    super.draw(point);
    // Smooth the line
    if (Point.distance(this.lastPoint, point) < 5) {
      return;
    }
    this.lastPoint = point;
    this.path.lineTo(point.x, point.y);
    this.boundingBox = updateBoundingBox(this.boundingBox, [point]);
  };

  end = (point: IPoint) => {
    this.path.lineTo(point.x, point.y);
    this.boundingBox = updateBoundingBox(this.boundingBox, [point]);
  };
}

/**
 *
 */
export class Pen extends Tool {
  constructor() {
    super(PenDrawing);
  }
}

class ArrowDrawing extends Drawing {
  get isValid() {
    return Point.distance(this.startPoint, this.endPoint) > 0;
  }

  draw = (point: IPoint) => {
    super.draw(point);

    this.path = new Path2D();
    this.path.moveTo(this.startPoint.x, this.startPoint.y);
    this.path.lineTo(this.endPoint.x, this.endPoint.y);
    const unitVector = new Vector(Point.subtract(this.startPoint, this.endPoint)).normalize();
    const leftVector = unitVector.rotate(Math.PI / 5);
    const rightVector = unitVector.rotate(-Math.PI / 5);
    const leftPoint = Point.add(this.endPoint, Point.multiply(leftVector, 20 * this.strokeScalingFactor));
    const rightPoint = Point.add(this.endPoint, Point.multiply(rightVector, 20 * this.strokeScalingFactor));
    this.path.lineTo(leftPoint.x, leftPoint.y);
    this.path.moveTo(this.endPoint.x, this.endPoint.y);
    this.path.lineTo(rightPoint.x, rightPoint.y);
  };
}

/**
 *
 */
export class Arrow extends Tool {
  constructor() {
    super(ArrowDrawing);
  }
}
