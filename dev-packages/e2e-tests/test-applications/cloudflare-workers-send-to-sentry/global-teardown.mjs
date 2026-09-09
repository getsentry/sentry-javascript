import { deleteWorker, keepsWorker } from './deployed-worker.mjs';

export default function globalTeardown() {
  const workerName = process.env.E2E_TEST_WORKER_NAME;

  if (!workerName) {
    return;
  }

  if (keepsWorker()) {
    console.log(`Keeping worker ${workerName} at ${process.env.E2E_TEST_WORKER_URL}`);
    return;
  }

  deleteWorker(workerName);
}
