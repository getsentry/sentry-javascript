import * as Sentry from '@sentry/node';
import { tracingChannel } from 'node:diagnostics_channel';

Sentry.init({ tracesSampleRate: 0 });

let loads = 0;
tracingChannel('orchestrion:dataloader:load').start.subscribe(() => {
  loads++;
});

const { default: DataLoader } = await import(`${import.meta.resolve('dataloader')}?instrumentation-test`);
const value = await new DataLoader(async keys => keys).load('real-key');
await Sentry.close(1000);
process.stdout.write(JSON.stringify([{ value, loads }]));
