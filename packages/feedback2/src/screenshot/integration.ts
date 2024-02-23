import type { Integration, IntegrationFn } from '@sentry/types';
import { isBrowser } from '@sentry/utils';

export const feedback2ScreenshotIntegration = ((options?: Record<string, unknown>) => {
  // eslint-disable-next-line deprecation/deprecation
  return new Feedback2Screenshot(options);
}) satisfies IntegrationFn;

/**
 * TODO
 *
 * @deprecated Use `feedback2ScreenshotIntegration()` instead.
 */
export class Feedback2Screenshot implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Feedback2Screenshot';

  /**
   * @inheritDoc
   */
  public name: string;

  public constructor({ id = 'sentry-feedback' }: Record<string, unknown> = {}) {
    // eslint-disable-next-line deprecation/deprecation
    this.name = Feedback2Screenshot.id;
  }

  /**
   * Setup and initialize feedback container
   */
  public setupOnce(): void {
    if (!isBrowser()) {
      return;
    }

    console.log('Feedback Screenshot is setup');
  }
}
