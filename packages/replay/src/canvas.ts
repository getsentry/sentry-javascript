import { getCanvasManager } from '@sentry-internal/rrweb';
import type { Integration } from '@sentry/types';
import type { ReplayConfiguration } from './types';

interface ReplayCanvasOptions {
  quality: 'low' | 'medium' | 'high';
}

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

  public constructor(options?: Partial<ReplayCanvasOptions>) {
    this.name = ReplayCanvas.id;
    this._canvasOptions = {
      quality: options && options.quality || 'medium',
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
  public getOptions(): Partial<ReplayConfiguration> {
    return {
      _experiments: {
        canvas: {
          ...this._canvasOptions,
          manager: getCanvasManager,
          quality: this._canvasOptions.quality,
        },
      },
    };
  }
}
