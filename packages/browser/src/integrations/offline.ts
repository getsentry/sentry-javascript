import { addGlobalEventProcessor, getCurrentHub } from '@sentry/core';
import { Event, Integration } from '@sentry/types';
import localforage from 'localforage';

import { captureEvent } from '../index';

/**
 * store errors occuring offline and send them when online again
 */
export class Offline implements Integration {
  /**
   * @inheritDoc
   */
  public readonly name: string = Offline.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'Offline';

  /**
   * the key to store the offline event queue
   */
  private readonly _storrageKey: string = 'offlineEventStore';

  public offlineEventStore: LocalForage;

  /**
   * @inheritDoc
   */
  public setupOnce(): void {
    addGlobalEventProcessor(async (event: Event) => {
      const self = getCurrentHub().getIntegration(Offline);
      if (self) {
        if (navigator.onLine) {
          return event;
        }
        await this._storeEvent(event);
        return null;
        // self._storeEvent(event);
      }
      return event;
    });
  }

  public constructor() {
    this.offlineEventStore = localforage.createInstance({
      name: 'sentryOfflineEventStore',
    });
    window.addEventListener('online', () => {
      this._drainQueue().catch(function(): void {
        // TODO: handle rejected promise
      });
    });
  }

  /**
   * store an event
   * @param event an event
   */
  private async _storeEvent(event: Event): Promise<void> {
    const storrageKey = this._storrageKey;
    const offlineEventStore = this.offlineEventStore;
    const promise: Promise<void> = new Promise(async function(resolve: () => void, reject: () => void): Promise<void> {
      let queue: Event[] = [];
      const value = await offlineEventStore.getItem(storrageKey);
      // .then(function(value: unknown): void {
      // })
      // .catch(function(err: Error): void {
      //   console.log(err);
      // });
      if (typeof value === 'string') {
        queue = JSON.parse(value);
      }
      queue.push(event);
      await offlineEventStore.setItem(storrageKey, JSON.stringify(queue)).catch(function(): void {
        // reject promise because saving to the localForge store did not work
        reject();
      });
      resolve();
    });
    return promise;
  }

  /**
   * capture all events in the queue
   */
  private async _drainQueue(): Promise<void> {
    const storrageKey = this._storrageKey;
    const offlineEventStore = this.offlineEventStore;
    const promise: Promise<void> = new Promise(async function(resolve: () => void, reject: () => void): Promise<void> {
      let queue: Event[] = [];
      // get queue
      const value = await offlineEventStore.getItem(storrageKey).catch(function(): void {
        // could not get queue from localForge, TODO: how to handle error?
      });
      // TODO: check if value in localForge can be converted with JSON.parse
      if (typeof value === 'string') {
        queue = JSON.parse(value);
      }
      await offlineEventStore.removeItem(storrageKey).catch(function(): void {
        // could not remove queue from localForge
        reject();
      });
      // process all events in the queue
      while (queue.length > 0) {
        const event = queue.pop();
        if (typeof event !== 'undefined') {
          captureEvent(event);
        }
      }
      resolve();
    });
    return promise;
  }
}
