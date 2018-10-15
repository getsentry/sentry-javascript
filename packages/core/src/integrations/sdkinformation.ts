import { Integration } from '@sentry/types';
import { logger } from '@sentry/utils/logger';

/**
 * @deprecated
 * This file can be safely removed in the next major bump
 */

/** Adds SDK info to an event. */
export class SDKInformation implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = 'SDKInformation';

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    logger.warn(
      "SDKInformation Integration is deprecated and can be safely removed. It's functionality has been merged into the SDK's core.",
    );
  }
}
