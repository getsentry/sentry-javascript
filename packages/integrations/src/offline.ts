/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Event, EventProcessor, Hub, Integration } from '@sentry/types';
import { GLOBAL_OBJ, logger, normalize, uuid4 } from '@sentry/utils';
import localForage from 'localforage';

const WINDOW = GLOBAL_OBJ as typeof GLOBAL_OBJ & Window;

type LocalForage = {
  setItem<T>(key: string, value: T, callback?: (err: any, value: T) => void): Promise<T>;
  iterate<T, U>(
    iteratee: (value: T, key: string, iterationNumber: number) => U,
    callback?: (err: any, result: U) => void,
  ): Promise<U>;
  removeItem(key: string, callback?: (err: any) => void): Promise<void>;
  length(): Promise<number>;
};

export type Item = { key: string; value: Event };

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
   * maximum number of events to store while offline
   */
  public maxStoredEvents: number;

  /**
   * event cache
   */
  public offlineEventStore: LocalForage;

  /**
   * @inheritDoc
   */
  public constructor(options: { maxStoredEvents?: number } = {}) {
    this.maxStoredEvents = options.maxStoredEvents || 30; // set a reasonable default
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    this.offlineEventStore = localForage.createInstance({
      name: 'sentry/offlineEventStore',
    });
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this.hub = getCurrentHub();

    if ('addEventListener' in WINDOW) {
      WINDOW.addEventListener('online', () => {
        void this._sendEvents().catch(() => {
          __DEBUG_BUILD__ && logger.warn('could not send cached events');
        });
      });
    }

    const eventProcessor: EventProcessor = event => {
      if (this.hub && this.hub.getIntegration(Offline)) {
        // cache if we are positively offline
        if ('navigator' in WINDOW && 'onLine' in WINDOW.navigator && !WINDOW.navigator.onLine) {
          __DEBUG_BUILD__ && logger.log('Event dropped due to being a offline - caching instead');

          void this._cacheEvent(event)
            .then((_event: Event): Promise<void> => this._enforceMaxEvents())
            .catch((_error): void => {
              __DEBUG_BUILD__ && logger.warn('could not cache event while offline');
            });

          // return null on success or failure, because being offline will still result in an error
          return null;
        }
      }

      return event;
    };

    eventProcessor.id = this.name;
    addGlobalEventProcessor(eventProcessor);

    // if online now, send any events stored in a previous offline session
    if ('navigator' in WINDOW && 'onLine' in WINDOW.navigator && WINDOW.navigator.onLine) {
      void this._sendEvents().catch(() => {
        __DEBUG_BUILD__ && logger.warn('could not send cached events');
      });
    }
  }

  /**
   * cache an event to send later
   * @param event an event
   */
  private async _cacheEvent(event: Event): Promise<Event> {
    return this.offlineEventStore.setItem<Event>(uuid4(), normalize(event));
  }

  /**
   * purge excess events if necessary
   */
  private async _enforceMaxEvents(): Promise<void> {
    const events: Array<{ event: Event; cacheKey: string }> = [];

    return this.offlineEventStore
      .iterate<Event, void>((event: Event, cacheKey: string, _index: number): void => {
        // aggregate events
        events.push({ cacheKey, event });
      })
      .then(
        (): Promise<void> =>
          // this promise resolves when the iteration is finished
          this._purgeEvents(
            // purge all events past maxStoredEvents in reverse chronological order
            events
              .sort((a, b) => (b.event.timestamp || 0) - (a.event.timestamp || 0))
              .slice(this.maxStoredEvents < events.length ? this.maxStoredEvents : events.length)
              .map(event => event.cacheKey),
          ),
      )
      .catch((_error): void => {
        __DEBUG_BUILD__ && logger.warn('could not enforce max events');
      });
  }

  /**
   * purge event from cache
   */
  private async _purgeEvent(cacheKey: string): Promise<void> {
    return this.offlineEventStore.removeItem(cacheKey);
  }

  /**
   * purge events from cache
   */
  private async _purgeEvents(cacheKeys: string[]): Promise<void> {
    // trail with .then to ensure the return type as void and not void|void[]
    return Promise.all(cacheKeys.map(cacheKey => this._purgeEvent(cacheKey))).then();
  }

  /**
   * send all events
   */
  private async _sendEvents(): Promise<void> {
    return this.offlineEventStore.iterate<Event, void>((event: Event, cacheKey: string, _index: number): void => {
      if (this.hub) {
        this.hub.captureEvent(event);

        void this._purgeEvent(cacheKey).catch((_error): void => {
          __DEBUG_BUILD__ && logger.warn('could not purge event from cache');
        });
      } else {
        __DEBUG_BUILD__ && logger.warn('no hub found - could not send cached event');
      }
    });
  }
}
