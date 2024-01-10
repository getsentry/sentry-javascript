import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

/**
 * This is a shim for the Replay integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove replay
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
class ReplayCanvasShim implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'ReplayCanvas';

  /**
   * @inheritDoc
   */
  public name: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(_options: any) {
    this.name = ReplayCanvasShim.id;

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error('You are using new ReplayCanvas() even though this bundle does not include replay canvas.');
    });
  }

  /** jsdoc */
  public setupOnce(): void {
    // noop
  }

  /** jsdoc */
  public getOptions(): void {
    // noop
  }
}

export { ReplayCanvasShim as ReplayCanvas };
