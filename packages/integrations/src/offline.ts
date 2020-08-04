import { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { getGlobalObject, logger, uuid4 } from '@sentry/utils';
// @ts-ignore: Module '"localforage"' has no default export.
import localforage from 'localforage';

/**
 * cache offline errors and send when connected
 */
export class Offline implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Offline';

  /**
   * @inheritDoc
   */
  public readonly name: string = Offline.id;

  /**
   * the current hub instance
   */
  public hub?: Hub;

  /**
   * event cache
   */
  public offlineEventStore: LocalForage; // type imported from localforage

  /**
   * @inheritDoc
   */
  public constructor() {
    this.offlineEventStore = localforage.createInstance({
      name: 'sentry/offlineEventStore',
    });

    const global = getGlobalObject<Window>();

    if ('addEventListener' in global) {
      global.addEventListener('online', (): void => {
        this._sendEvents().catch(() => {
          logger.warn('could not send cached events');
        });
      });
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.hub = getCurrentHub();

    addGlobalEventProcessor((event: Event) => {
      if (this.hub && this.hub.getIntegration(Offline)) {
        const global = getGlobalObject<Window>();

        // cache if we are positively offline
        if ('navigator' in global && 'onLine' in global.navigator && !global.navigator.onLine) {
          this._cacheEvent(event).catch((_error: any) => {
            logger.warn('could not cache event while offline');
          });

          // return null on success or failure, because being offline will still result in an error
          return null;
        }
      }

      return event;
    });
  }

  /**
   * cache an event to send later
   * @param event an event
   */
  private async _cacheEvent(event: Event): Promise<Event> {
    return this.offlineEventStore.setItem<Event>(uuid4(), event);
  }

  /**
   * purge event from cache
   */
  private async _purgeEvent(cacheKey: string): Promise<void> {
    return this.offlineEventStore.removeItem(cacheKey);
  }

  /**
   * send all events
   */
  private async _sendEvents(): Promise<void> {
    return this.offlineEventStore.iterate<Event, void>((event: Event, cacheKey: string, _index: number): void => {
      if (this.hub) {
        const newEventId = this.hub.captureEvent(event);

        if (newEventId) {
          this._purgeEvent(cacheKey).catch((_error: any): void => {
            logger.warn('could not purge event from cache');
          });
        }
      } else {
        logger.warn('no hub found - could not send cached event');
      }
    });
  }
}
