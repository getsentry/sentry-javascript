import * as Sentry from '@sentry/node';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, defineExtension, defineTool, Harness, MemoryStorage } from '@earendil-works/pi-durable';

const context = BACKGROUND_CONTEXT;

// Six runs that do not end with an answer:
// 1. the model request fails (`stopReason` error), with retries off;
// 2. the provider throws, which faults the generation task;
// 3. the run is aborted while the `slow` tool waits;
// 4. the run is aborted while the model request is in flight;
// 5. the Harness closes while the `slow` tool waits;
// 6. in a second Harness, the model request fails and the Harness closes right after `wait()`.
const started = new Map();
const toolStarted = job => new Promise(resolve => started.set(job, resolve));

const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const realModels = createModels();
realModels.setProvider(faux.provider);
// The faux provider turns a throwing response into an error message, so the throw of a broken
// provider is staged in front of pi-ai: the request after `breakNextRequest()` throws synchronously.
let brokenRequests = 0;
const breakNextRequest = () => brokenRequests++;
const models = new Proxy(realModels, {
  get(target, property) {
    const value = Reflect.get(target, property, target);
    if (property === 'streamSimple') {
      return (...args) => {
        if (brokenRequests > 0) {
          brokenRequests--;
          throw new Error('provider broke');
        }
        return value.apply(target, args);
      };
    }
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
faux.setResponses([
  fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'provider exploded' }),
  fauxAssistantMessage(fauxToolCall('slow', { job: 'abort' }, { id: 'call_abort' }), { stopReason: 'toolUse' }),
  async (_transcript, options) => {
    started.get('request')();
    await new Promise(resolve => options.signal.addEventListener('abort', resolve));
    return fauxAssistantMessage('partial', { stopReason: 'aborted' });
  },
  fauxAssistantMessage(fauxToolCall('slow', { job: 'close' }, { id: 'call_close' }), { stopReason: 'toolUse' }),
  fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'provider exploded again' }),
]);

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      defineTool({
        name: 'slow',
        description: 'Waits until it is aborted.',
        parameters: Type.Object({ job: Type.String() }),
        execute: async (args, _api, toolContext) => {
          started.get(args.job)();
          await new Promise((_, reject) =>
            toolContext.abortSignal.addEventListener('abort', () => reject(new Error('tool aborted'))),
          );
          return { content: [] };
        },
      }),
    ],
  }),
);

const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry, settings: { retry: { enabled: false } } },
  context,
);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });

await (await root.submit({ type: 'input', content: 'Fail please.' }, context)).wait(context);
breakNextRequest();
await (await root.submit({ type: 'input', content: 'Break please.' }, context)).wait(context);

const abortRun = toolStarted('abort');
const aborted = await root.submit({ type: 'input', content: 'Run slow, then abort.' }, context);
await abortRun;
await root.abort(context);
await aborted.wait(context);

const requestRun = toolStarted('request');
const abortedRequest = await root.submit({ type: 'input', content: 'Answer slowly, then abort.' }, context);
await requestRun;
await root.abort(context);
await abortedRequest.wait(context);

const closeRun = toolStarted('close');
await root.submit({ type: 'input', content: 'Run slow, then close.' }, context);
await closeRun;
await harness.close(context);

const second = await Harness.open(
  new MemoryStorage(),
  { models, registry, settings: { retry: { enabled: false } } },
  context,
);
const secondRoot = await second.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
await (await secondRoot.submit({ type: 'input', content: 'Fail, then close.' }, context)).wait(context);
await second.close(context);

// Everything captured during the runs is sent before this sentinel.
await Sentry.flush(2000);
Sentry.captureMessage('pi-durable interrupted done');
