import type { Integration } from '@sentry/types';
import { consoleSandbox } from '@sentry/utils';

/**
 * This is a shim for the Feedback integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove feedback
 * from it, without changing their config. This is necessary for the loader mechanism.
 *
 * @deprecated Use `feedbackIntergation()` instead.
 */
class FeedbackShim implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback';

  /**
   * @inheritDoc
   */
  public name: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public constructor(_options: any) {
    // eslint-disable-next-line deprecation/deprecation
    this.name = FeedbackShim.id;

    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn('You are using new Feedback() even though this bundle does not include Feedback.');
    });
  }

  /** jsdoc */
  public setupOnce(): void {
    // noop
  }

  /** jsdoc */
  public openDialog(): void {
    // noop
  }

  /** jsdoc */
  public closeDialog(): void {
    // noop
  }

  /** jsdoc */
  public attachTo(): void {
    // noop
  }

  /** jsdoc */
  public createWidget(): void {
    // noop
  }

  /** jsdoc */
  public removeWidget(): void {
    // noop
  }

  /** jsdoc */
  public getWidget(): void {
    // noop
  }
  /** jsdoc */
  public remove(): void {
    // noop
  }
}

/**
 * This is a shim for the Feedback integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove feedback
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export function feedbackIntegration(_options: unknown): Integration {
  // eslint-disable-next-line deprecation/deprecation
  return new FeedbackShim({});
}

// eslint-disable-next-line deprecation/deprecation
export { FeedbackShim as Feedback };
