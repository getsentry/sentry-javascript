import { logger } from '@sentry/utils';
import workerString from './worker/worker.js';

// TODO: better handling if there's no Worker api available
export class WorkerInterface {
  worker: Worker;
  constructor() {
    if (window.Worker) {
      const workerBlob = new Blob([workerString]);
      const workerUrl = URL.createObjectURL(workerBlob);

      this.worker = new Worker(workerUrl);
      logger.log(this.worker);
      this.worker.onmessage = function (e) {
        logger.log(e.data);
        logger.log('Message received from worker');
      };
    } else {
      logger.log('workers not available');
    }
  }

  init() {
    this.worker.postMessage('init');
    logger.log('Message posted to worker');
  }

  add() {
    this.worker.postMessage('add');
    logger.log('Message posted to worker');
  }

  finish() {
    this.worker.postMessage('finish');
    logger.log('Message posted to worker');
  }
}
