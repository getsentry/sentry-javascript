import { dirname, join } from 'node:path';
import { Queue, Worker } from 'bullmq';

const connection = { host: 'localhost', port: 6385 };

async function run() {
  const queue = new Queue('crons', { connection });
  const sandboxedQueue = new Queue('crons-sandboxed', { connection });
  await queue.obliterate({ force: true });
  await sandboxedQueue.obliterate({ force: true });

  const worker = new Worker(
    'crons',
    async job => {
      if (job.name === 'failing' || (job.name === 'flaky' && job.attemptsMade === 0)) {
        throw new Error('Error in scheduled job');
      }
    },
    { connection },
  );
  const sandboxedWorker = new Worker('crons-sandboxed', join(dirname(process.argv[1]), 'processor.cjs'), {
    connection,
  });

  // Waits for every job to finish, including the ones that send no check-ins.
  const pending = new Map([
    ['plain', 1],
    ['legacy', 1],
    ['legacy-key', 1],
    ['excluded', 1],
    ['every', 2],
    ['failing', 1],
    ['flaky', 1],
    ['sandboxed', 1],
  ]);
  const finished = new Promise(resolve => {
    const done = job => {
      const left = pending.get(job?.name);
      if (left === undefined) {
        return;
      }
      if (left > 1) {
        pending.set(job.name, left - 1);
      } else {
        pending.delete(job.name);
      }
      if (!pending.size) {
        resolve();
      }
    };
    for (const w of [worker, sandboxedWorker]) {
      w.on('completed', done);
      w.on('failed', job => job?.finishedOn && done(job));
    }
  });

  // Runs delayed scheduler jobs now. The loop below and the `completed` listener can race to promote the same job.
  const promote = job => job?.promote().catch(() => {});

  // Runs the iteration the worker created after the first run, instead of waiting 5 minutes.
  let promoted = false;
  worker.on('completed', async job => {
    if (job.name !== 'every' || promoted) {
      return;
    }
    promoted = true;
    const delayed = await queue.getDelayed();
    await promote(delayed.find(next => next.repeatJobKey === 'every-scheduler'));
  });

  await queue.add('plain', {});
  await queue.add('legacy', {}, { repeat: { every: 300_000, immediately: true } });
  await queue.add('legacy-key', {}, { repeat: { every: 300_000, key: 'custom-key', immediately: true } });
  await queue.upsertJobScheduler('excluded-scheduler', { every: 300_000 }, { name: 'excluded' });
  await queue.upsertJobScheduler('every-scheduler', { every: 300_000 }, { name: 'every' });
  await queue.upsertJobScheduler(
    'pattern-scheduler',
    { pattern: '0 0 9 * * 1-5', tz: 'Europe/Vienna', immediately: true },
    { name: 'failing' },
  );
  await queue.upsertJobScheduler('retry-scheduler', { every: 600_000 }, { name: 'flaky', opts: { attempts: 2 } });
  await sandboxedQueue.upsertJobScheduler('sandboxed-scheduler', { every: 300_000 }, { name: 'sandboxed' });

  // BullMQ 5.16 starts an `every` scheduler at its next full interval, so run the first jobs now.
  for (const job of [...(await queue.getDelayed()), ...(await sandboxedQueue.getDelayed())]) {
    if (job.opts.repeat?.count === 1) {
      await promote(job);
    }
  }

  await finished;
  await worker.close();
  await sandboxedWorker.close();
  await queue.obliterate({ force: true });
  await sandboxedQueue.obliterate({ force: true });
  await queue.close();
  await sandboxedQueue.close();
  process.exit();
}

void run();
