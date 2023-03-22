import type { Integration, EventProcessor, Hub } from '@sentry/types';

export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  public name: string = Undici.id;

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {}
}
