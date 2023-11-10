import type { IPoint, Rect } from './types';

function asPoint(x: IPoint | number): IPoint {
  return typeof x === 'number' ? Point.fromNumber(x) : x;
}

/**
 *
 */
export class Vector implements IPoint {
  public x: number;
  public y: number;

  /**
   *
   */
  public get length(): number {
    return Point.distance(Point.fromNumber(0), this);
  }

  /**
   *
   */
  static fromPoints(point1: IPoint, point2: IPoint): Vector {
    return new Vector(Point.subtract(point2, point1));
  }

  constructor(point: IPoint) {
    this.x = point.x;
    this.y = point.y;
  }

  /**
   *
   */
  normalize() {
    const length = this.length;
    return new Vector({
      x: this.x / length,
      y: this.y / length,
    });
  }

  /**
   *
   */
  rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector({
      x: this.x * cos - this.y * sin,
      y: this.x * sin + this.y * cos,
    });
  }
}

/**
 *
 */
export class Point {
  /**
   *
   */
  static fromMouseEvent(e: MouseEvent): IPoint {
    return {
      x: e.clientX,
      y: e.clientY,
    };
  }

  /**
   *
   */
  static fromNumber(x: number, y?: number): IPoint {
    return { x, y: y ?? x };
  }

  /**
   *
   */
  static multiply(point: IPoint, multiplier: number | IPoint): IPoint {
    const mult = asPoint(multiplier);
    return {
      x: point.x * mult.x,
      y: point.y * mult.y,
    };
  }

  /**
   *
   */
  static divide(point: IPoint, divisor: number | IPoint): IPoint {
    const div = asPoint(divisor);
    return {
      x: point.x / div.x,
      y: point.y / div.y,
    };
  }

  /**
   *
   */
  static add(point1: IPoint, point2: number | IPoint): IPoint {
    const point = asPoint(point2);
    return {
      x: point1.x + point.x,
      y: point1.y + point.y,
    };
  }

  /**
   *
   */
  static subtract(point1: IPoint, point2: number | IPoint): IPoint {
    const point = asPoint(point2);
    return {
      x: point1.x - point.x,
      y: point1.y - point.y,
    };
  }

  /**
   *
   */
  static distance(point1: IPoint, point2: IPoint): number {
    return Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));
  }

  /**
   *
   */
  static round(point: IPoint): IPoint {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y),
    };
  }
}

/**
 *
 */
export function getCanvasScaleRatio(canvas: HTMLCanvasElement): IPoint {
  const rect = canvas.getBoundingClientRect();
  const verticalScale = canvas.height / rect.height;
  const horizontalScale = canvas.width / rect.width;
  return {
    x: horizontalScale,
    y: verticalScale,
  };
}

/**
 *
 */
export function translatePoint(point: IPoint, ratio: IPoint): IPoint {
  return Point.multiply(point, ratio);
}

/**
 *
 */
export function translatePointToDocument(point: IPoint, canvas: HTMLCanvasElement): IPoint {
  return translatePoint(point, Point.divide(Point.fromNumber(1), getCanvasScaleRatio(canvas)));
}

/**
 *
 */
export function translateBoundingBoxToDocument(boundingBox: Rect, canvas: HTMLCanvasElement): Rect {
  const start = translatePointToDocument(boundingBox, canvas);
  const dimensions = translatePointToDocument(Point.fromNumber(boundingBox.width, boundingBox.height), canvas);
  return {
    x: start.x + canvas.getBoundingClientRect().left,
    y: start.y + canvas.getBoundingClientRect().top,
    width: dimensions.x,
    height: dimensions.y,
  };
}

/**
 *
 */
export function translateMouseEvent(e: MouseEvent, canvas: HTMLCanvasElement): IPoint {
  const ratio = getCanvasScaleRatio(canvas);
  const clientRect = canvas.getBoundingClientRect();
  const canvasOffset = Point.fromNumber(clientRect.left, clientRect.top);
  return Point.round(translatePoint(Point.subtract(Point.fromMouseEvent(e), canvasOffset), ratio));
}

/**
 *
 */
export function translatePointToCanvas(point: IPoint, canvas: HTMLCanvasElement): IPoint {
  return translatePoint(point, getCanvasScaleRatio(canvas));
}

/**
 *
 */
export function translateRect(rect: Rect, vector: IPoint): Rect {
  return {
    x: rect.x + vector.x,
    y: rect.y + vector.y,
    width: rect.width,
    height: rect.height,
  };
}

/**
 *
 */
export function getPointsBoundingBox(points: IPoint[]): Rect {
  const xValues = points.map(p => p.x);
  const yValues = points.map(p => p.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 *
 */
export function updateBoundingBox(boundingBox: Rect, points: IPoint[]): Rect {
  return getPointsBoundingBox([
    ...points,
    Point.fromNumber(boundingBox.x, boundingBox.y),
    Point.fromNumber(boundingBox.x + boundingBox.width, boundingBox.y + boundingBox.height),
  ]);
}
