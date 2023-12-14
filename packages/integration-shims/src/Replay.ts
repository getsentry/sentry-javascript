import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

/**
 * This is a shim for the Replay integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove replay
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
class ReplayShim implements Integration {
  /**
   * @inheritDoc
   */
  public static id = 'Replay';

  /**
   * @inheritDoc
   */
  public name: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(_options: any) {
    this.name = ReplayShim.id;

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error('You are using new Replay() even though this bundle does not include replay.');
    });
  }

  /** jsdoc */
  public setupOnce(): void {
    // noop
  }

  /** jsdoc */
  public start(): void {
    // noop
  }

  /** jsdoc */
  public stop(): void {
    // noop
  }

  /** jsdoc */
  public flush(): void {
    // noop
  }
}

export { ReplayShim as Replay };
