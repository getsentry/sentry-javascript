import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

/**
 * This is a shim for the BrowserTracing integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove tracing
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
class BrowserTracingShim implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'BrowserTracing';

  /**
   * @inheritDoc
   */
  public name: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(_options: any) {
    this.name = BrowserTracingShim.id;

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.error('You are using new BrowserTracing() even though this bundle does not include tracing.');
    });
  }

  /** jsdoc */
  public setupOnce(): void {
    // noop
  }
}

export { BrowserTracingShim as BrowserTracing };

/** Shim function */
export function addTracingExtensions(): void {
  // noop
}
