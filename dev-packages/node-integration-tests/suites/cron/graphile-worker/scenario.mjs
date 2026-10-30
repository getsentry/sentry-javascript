import { makeWorkerUtils, run } from 'graphile-worker';

const connectionString = 'postgres://test:test@localhost:5498/tests';

async function main() {
  // Mark the crontab items as known two hours ago, so `?fill=2h` backfills their runs right away.
  const utils = await makeWorkerUtils({ connectionString });
  await utils.migrate();
  await utils.withPgClient(client =>
    client.query(
      `insert into graphile_worker._private_known_crontabs (identifier, known_since)
       select unnest($1::text[]), now() - interval '2 hours'
       on conflict (identifier) do update set known_since = excluded.known_since, last_execution = null`,
      [['hourly-report', 'failing_task']],
    ),
  );
  await utils.release();

  const runner = await run({
    connectionString,
    concurrency: 1,
    noHandleSignals: true,
    pollInterval: 100,
    crontab: ['0 * * * * report_task ?fill=2h&id=hourly-report', '30 * * * * failing_task ?fill=2h&max=1'].join('\n'),
    taskList: {
      report_task: async () => {},
      failing_task: async () => {
        throw new Error('Cron job failed');
      },
    },
  });

  setTimeout(async () => {
    await runner.stop();
    process.exit(0);
  }, 15_000);
}

main();
