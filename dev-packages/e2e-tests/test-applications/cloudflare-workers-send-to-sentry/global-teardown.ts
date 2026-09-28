import { deleteWorker, keepsWorker } from './deployed-worker';

export default function globalTeardown(): void {
  const workerName = process.env.E2E_TEST_WORKER_NAME;

  if (!workerName) {
    return;
  }

  if (keepsWorker()) {
    console.log(`Keeping worker ${workerName} at ${process.env.E2E_TEST_WORKER_URL}`);
    return;
  }

  try {
    deleteWorker(workerName);
  } catch (error) {
    // A leaked worker is not an SDK failure, so it must not fail a run whose tests passed.
    console.error(
      `Failed to delete worker ${workerName}, delete it with \`wrangler delete --name ${workerName}\`:`,
      error,
    );
  }
}
