import * as Sentry from '@sentry/node';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider } from '@earendil-works/pi-ai/providers/faux';
import { createRegistry, Harness } from '@earendil-works/pi-durable';
import { openNodeJsonlStorage } from '@earendil-works/pi-durable/storage/jsonl/node';

const context = BACKGROUND_CONTEXT;

// The first Harness closes while a model request is in flight, which leaves the generation task in
// storage. A second Harness on the same storage aborts the conversation before anything resumes the
// task, so pi-durable runs only the abort handler of that task, in a Harness without a run for it.
let requestStarted;
const requestInFlight = new Promise(resolve => (requestStarted = resolve));
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  async (_transcript, options) => {
    requestStarted();
    await new Promise(resolve => options.signal.addEventListener('abort', resolve));
    return fauxAssistantMessage('partial', { stopReason: 'aborted' });
  },
]);

const registry = createRegistry();
const directory = await mkdtemp(join(tmpdir(), 'pi-durable-restart-'));
const open = async () => Harness.open(await openNodeJsonlStorage(directory, context), { models, registry }, context);

const first = await open();
const root = await first.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
const submission = await root.submit({ type: 'input', content: 'Answer slowly.' }, context);
await requestInFlight;
await first.close(context);

let restarted = false;
let runsStarted = 0;
Sentry.getClient().on('spanStart', span => {
  if (restarted && Sentry.spanToJSON(span).name === 'invoke_agent') {
    runsStarted++;
  }
});
restarted = true;

const second = await open();
await (await second.conversation(root.id, context)).abort(context);
const settled = await (await second.submission(submission.id, context)).wait(context);
await second.close(context);

// Everything captured during the runs is sent before this sentinel.
await Sentry.flush(2000);
Sentry.captureMessage('pi-durable restart abort', {
  extra: { status: settled.status, reason: settled.reason, runsStarted },
});
