const Sentry = require('@sentry/node');
const { tracingChannel } = require('node:diagnostics_channel');

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

async function run() {
  const observations = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const DataLoader = require('dataloader');
    const value = await new DataLoader(async keys => keys).load('real-key');
    observations.push({ value, loads, injections });
    delete require.cache[require.resolve('dataloader')];
  }
  await Sentry.close(1000);
  process.stdout.write(JSON.stringify(observations));
}

run();
