import { logger } from './util/logger';
import workerString from './worker/worker.js';
import { RecordingEvent, WorkerResponse } from './types';

interface CreateEventBufferParams {
  useCompression: boolean;
}

export function createEventBuffer({ useCompression }: CreateEventBufferParams) {
  if (useCompression && window.Worker) {
    const workerBlob = new Blob([workerString]);
    const workerUrl = URL.createObjectURL(workerBlob);

    try {
      logger.log('using compression worker');
      return new EventBufferCompressionWorker(new Worker(workerUrl));
    } catch {
      // catch and ignore, fallback to simple event buffer
    }
  }

  logger.log('falling back to simple event buffer');
  return new EventBufferArray();
}

export interface IEventBuffer {
  get length(): number;
  destroy(): void;
  addEvent(event: RecordingEvent, isCheckout?: boolean): void;
  finish(): Promise<string | Uint8Array>;
}

class EventBufferArray implements IEventBuffer {
  events: RecordingEvent[];

  constructor() {
    this.events = [];
  }

  destroy() {
    this.events = [];
  }

  get length() {
    return this.events.length;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    if (isCheckout) {
      this.events = [event];
      return;
    }

    this.events.push(event);
  }

  finish() {
    return new Promise<string>((resolve) => {
      // Make a copy of the events array reference and immediately clear the
      // events member so that we do not lose new events while uploading
      // attachment.
      const eventsRet = this.events;
      this.events = [];
      resolve(JSON.stringify(eventsRet));
    });
  }
}

// exporting for testing
export class EventBufferCompressionWorker implements IEventBuffer {
  private worker: Worker;
  private eventBufferItemLength = 0;

  constructor(worker: Worker) {
    this.worker = worker;
  }

  init() {
    this.worker.postMessage({ method: 'init', args: [] });
    logger.log('Message posted to worker');
  }

  destroy() {
    this.worker.terminate();
    this.worker = null;
  }

  get length() {
    return this.eventBufferItemLength;
  }

  addEvent(event: RecordingEvent, isCheckout?: boolean) {
    // If it is a checkout we should make sure worker buffer is cleared before proceeding
    if (!isCheckout) {
      this.sendEventToWorker(event);
      return;
    }

    const initListener = ({ data }: MessageEvent<WorkerResponse>) => {
      if (data.method !== 'init') {
        return;
      }

      if (!data.success) {
        // TODO: Do some error handling, not sure what
        logger.error(data.response);
        return;
      }

      // Worker has been re-initialized, can add event now
      this.sendEventToWorker(event);
      this.worker.removeEventListener('message', initListener);
    };
    this.worker.addEventListener('message', initListener);

    this.worker.postMessage({ method: 'init', args: [] });
  }

  sendEventToWorker(event: RecordingEvent) {
    this.worker.postMessage({
      method: 'addEvent',
      args: [event],
    });
    logger.log('Message posted to worker');
    this.eventBufferItemLength++;
  }

  finish() {
    return new Promise<Uint8Array>((resolve) => {
      const finishListener = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.method !== 'finish') {
          return;
        }

        if (!data.success) {
          // TODO: Do some error handling, not sure what
          logger.error(data.response);
          return;
        }

        logger.log('sending compressed');
        resolve(data.response as Uint8Array);
        this.eventBufferItemLength = 0;
        this.worker.removeEventListener('message', finishListener);
      };
      this.worker.addEventListener('message', finishListener);

      this.worker.postMessage({ method: 'finish', args: [] });
      logger.log('Message posted to worker');
    });
  }
}
