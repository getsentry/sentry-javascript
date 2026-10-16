import * as Sentry from '@sentry/node';
import { tracingChannel } from 'node:diagnostics_channel';
import { createRequire } from 'node:module';

Sentry.init({ tracesSampleRate: 0 });

let loads = 0;
let injections = 0;
Sentry.getClient().on('orchestrion.module-injected', moduleName => {
  if (moduleName === 'dataloader') {
    injections++;
  }
});
tracingChannel('orchestrion:dataloader:load').start.subscribe(() => {
  loads++;
});

const url = import.meta.resolve('dataloader');
await import(`${url}?first`);
await import(`${url}?second`);

const require = createRequire(import.meta.url);
delete require.cache[require.resolve('dataloader')];
injections = 0;

const DataLoader = require('dataloader');
const value = await new DataLoader(async keys => keys).load('real-key');
process.stdout.write(JSON.stringify([{ value, loads, injections }]));
