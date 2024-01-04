import { getCanvasManager } from '@sentry-internal/rrweb';
import type { Integration } from '@sentry/types';
import type { ReplayConfiguration } from './types';

interface ReplayCanvasOptions {
  fps: number;
  quality: number;
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

  public constructor() {
    this.name = ReplayCanvas.id;
    // TODO FN: Allow to configure this
    // But since we haven't finalized how to configure this, this is predefined for now
    // to avoid breaking changes
    this._canvasOptions = {
      fps: 4,
      quality: 0.6,
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
        },
      },
    };
  }
}
