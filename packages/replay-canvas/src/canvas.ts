import { CanvasManager } from '@sentry-internal/rrweb';
import type { CanvasManagerInterface } from '@sentry/replay';
import type { Integration } from '@sentry/types';

interface ReplayCanvasOptions {
  quality: 'low' | 'medium' | 'high';
}

interface ReplayCanvasIntegrationOptions {
  recordCanvas: true;
  getCanvasManager: (options: ConstructorParameters<typeof CanvasManager>[0]) => CanvasManagerInterface;
  sampling: {
    canvas: number;
  };
  dataURLOptions: {
    type: string;
    quality: number;
  };
}

const CANVAS_QUALITY = {
  low: {
    sampling: {
      canvas: 1,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.25,
    },
  },
  medium: {
    sampling: {
      canvas: 2,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.4,
    },
  },
  high: {
    sampling: {
      canvas: 4,
    },
    dataURLOptions: {
      type: 'image/webp',
      quality: 0.5,
    },
  },
};

/** An integration to add canvas recording to replay. */
export class ReplayCanvas implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReplayCanvas';

  /**
   * @inheritDoc
   */
  public name: string;

  private _canvasOptions: ReplayCanvasOptions;

  public constructor(options: Partial<ReplayCanvasOptions> = {}) {
    this.name = ReplayCanvas.id;
    this._canvasOptions = {
      quality: options.quality || 'medium',
    };
  }

  /** @inheritdoc */
  public setupOnce(): void {
    // noop
  }

  /**
   * Get the options that should be merged into replay options.
   * This is what is actually called by the Replay integration to setup canvas.
   */
  public getOptions(): ReplayCanvasIntegrationOptions {
    const { quality } = this._canvasOptions;

    return {
      recordCanvas: true,
      getCanvasManager: (options: ConstructorParameters<typeof CanvasManager>[0]) => new CanvasManager(options),
      ...(CANVAS_QUALITY[quality || 'medium'] || CANVAS_QUALITY.medium),
    };
  }
}
