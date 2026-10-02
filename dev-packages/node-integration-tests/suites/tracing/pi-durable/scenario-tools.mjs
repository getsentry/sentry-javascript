import * as Sentry from '@sentry/node';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import {
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  hook,
  MemoryStorage,
  ToolTask,
} from '@earendil-works/pi-durable';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';
import { CodingTools, createBashTool } from '@earendil-works/pi-durable/tools';

const context = BACKGROUND_CONTEXT;

// One tool round, run one call at a time so the order of the error events is fixed:
// - `bash` is the built-in tool, registered by the app's own extension through its factory; it runs
//   a command that exits non-zero, which it reports by throwing;
// - `read` is an app tool that replaces the built-in `read` by name, and throws;
// - `streamer` returns nothing, so its streamed output becomes the result;
// - `secret` returns a value an `afterTool` hook redacts before the model sees it;
// - `fail_now` is an app tool that throws.
const faux = fauxProvider({ provider: 'faux', models: [{ id: 'faux-model' }] });
const models = createModels();
models.setProvider(faux.provider);
faux.setResponses([
  fauxAssistantMessage(
    [
      fauxToolCall('bash', { command: 'ls does-not-exist' }, { id: 'call_bash' }),
      fauxToolCall('read', { path: 'notes.txt' }, { id: 'call_read' }),
      fauxToolCall('streamer', {}, { id: 'call_streamer' }),
      fauxToolCall('secret', {}, { id: 'call_secret' }),
      fauxToolCall('fail_now', {}, { id: 'call_fail' }),
    ],
    { stopReason: 'toolUse' },
  ),
  fauxAssistantMessage('Done.'),
]);

const registry = createRegistry();
registry.install(CodingTools);
registry.install(
  defineExtension({
    name: 'app',
    tools: [
      createBashTool(),
      defineTool({
        name: 'read',
        description: 'Reads notes.',
        parameters: Type.Object({ path: Type.String() }),
        execute: async () => {
          throw new Error('app read failed');
        },
      }),
      defineTool({
        name: 'streamer',
        description: 'Streams its output.',
        parameters: Type.Object({}),
        execute: async (_args, api) => {
          api.output('line 1\n');
          api.output('line 2\n');
          return {};
        },
      }),
      defineTool({
        name: 'secret',
        description: 'Returns a secret.',
        parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: 'text', text: 'original secret value' }] }),
      }),
      defineTool({
        name: 'fail_now',
        description: 'Always throws.',
        parameters: Type.Object({}),
        execute: async () => {
          throw new Error('Intentional pi-durable tool failure');
        },
      }),
    ],
    hooks: [
      hook(ToolTask, {
        afterTool: (call, result) =>
          call.name === 'secret'
            ? { ...result, content: [{ type: 'text', text: 'redacted by afterTool' }] }
            : undefined,
      }),
    ],
  }),
);

const cwd = mkdtempSync(join(tmpdir(), 'pi-durable-tools-'));
const harness = await Harness.open(
  new MemoryStorage(),
  { models, registry, env: () => new NodeExecutionEnv({ cwd }), settings: { toolExecution: 'sequential' } },
  context,
);
const root = await harness.root(context, { agent: { model: { provider: 'faux', modelId: 'faux-model' } } });
await (await root.submit({ type: 'input', content: 'Run the tools.' }, context)).wait(context);
await harness.close(context);

// Everything captured during the run is sent before this sentinel.
await Sentry.flush(2000);
Sentry.captureMessage('pi-durable tools done');
