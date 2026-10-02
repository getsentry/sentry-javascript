import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import {
  AssistantEntry,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  section,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import * as Sentry from '@sentry/node';

const context = BACKGROUND_CONTEXT;
const MODEL = { provider: 'openrouter', modelId: 'anthropic/claude-haiku-4.5' };
const CRASH_EXIT_CODE = 75;

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is not set (E2E_OPENROUTER_API_KEY in the e2e-tests .env)');
}

const dataDir = fileURLToPath(new URL('../.data/', import.meta.url));
mkdirSync(dataDir, { recursive: true });

const models = createModels();
models.setProvider(openrouterProvider()); // reads OPENROUTER_API_KEY

const tools = [
  defineTool({
    name: 'get_weather',
    description: 'Get the current weather for a city.',
    parameters: Type.Object({ city: Type.String() }),
    // The manual span should nest under the SDK's `execute_tool` span.
    execute: async args =>
      Sentry.startSpan({ name: 'resolve-weather', attributes: { 'weather.city': args.city } }, () => ({
        content: [{ type: 'text', text: `It is 21 degrees and sunny in ${args.city}.` }],
      })),
  }),
  defineTool({
    name: 'fail_now',
    description: 'Always throws an error. Call this when the user asks to trigger a failure.',
    parameters: Type.Object({}),
    execute: async () => {
      throw new Error('Intentional pi-durable tool failure');
    },
  }),
  defineTool({
    name: 'flaky_step',
    description: 'Runs one step of a job. Call this when the user asks to run the flaky step.',
    parameters: Type.Object({ job: Type.String() }),
    // Replay-safe, so pi-durable reruns the call after the crash instead of failing it.
    replay: 'safe',
    execute: async args => {
      // The marker is created once, atomically; its presence means the first attempt already crashed.
      try {
        writeFileSync(`${dataDir}flaky-${args.job}`, 'crashed once', { flag: 'wx' });
      } catch {
        return { content: [{ type: 'text', text: `Step of job ${args.job} completed.` }] };
      }
      process.exit(CRASH_EXIT_CODE);
    },
  }),
  defineTool({
    name: 'delegate',
    description: 'Delegate a self-contained task to a subagent and get its answer back.',
    parameters: Type.Object({ task: Type.String() }),
    replay: 'safe',
    execute: async (args, api, toolContext) => {
      const childId = await api.commit(async tx => {
        const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
        if (existing !== undefined) return existing.id;
        return (await tx.createConversation({ ownership: { kind: 'task', taskId: api.taskId } })).id;
      }, toolContext);
      const child = await api.conversation(childId, toolContext);
      const request = { type: 'input', content: args.task, requestId: `delegate:${api.taskId}` };
      const settled = await (await child.submit(request, toolContext)).wait(toolContext);
      if (settled.status !== 'done') {
        return { isError: true, content: [{ type: 'text', text: `Subagent ended: ${settled.reason}` }] };
      }
      const answer = await api.commit(tx => tx.entry(AssistantEntry, settled.answer), toolContext);
      const text = (answer?.model?.[0]?.content ?? [])
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
      return { content: [{ type: 'text', text }] };
    },
  }),
];

const registry = createRegistry();
registry.install(
  defineExtension({
    name: 'e2e',
    sections: [
      section('preamble', () => 'You are a test assistant. Use the tools exactly as asked. Keep answers short.', {
        tag: false,
      }),
    ],
    tools,
  }),
);

const storage = await openNodeSqliteStorage(`${dataDir}pi.sqlite`);
const harness = await Harness.open(storage, { models, registry }, context);
// Continue whatever the previous process left unfinished, such as a run interrupted by `flaky_step`.
harness.resume();

async function readJson(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'POST' && url.pathname === '/conversations') {
    const conversation = await harness.createConversation(
      { ownership: { kind: 'ownerless' }, agent: { model: MODEL } },
      context,
    );
    return { id: conversation.id };
  }

  // Returns as soon as the input is admitted. The run continues in the background, possibly in a
  // later process, so clients poll `GET /submissions/:id` for the outcome.
  if (req.method === 'POST' && parts[0] === 'conversations' && parts[2] === 'messages') {
    const conversation = await harness.conversation(Number(parts[1]), context);
    if (!conversation) return undefined;
    const { content } = await readJson(req);
    const submission = await conversation.submit({ type: 'input', content }, context);
    return { submissionId: submission.id };
  }

  if (req.method === 'GET' && parts[0] === 'submissions') {
    const submission = await harness.submission(Number(parts[1]), context);
    if (!submission) return undefined;
    const record = await submission.status(context);
    return { status: record.status, reason: record.reason, detail: record.detail };
  }

  return undefined;
}

createServer((req, res) => {
  handle(req, res).then(
    result => {
      res.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result ?? { error: 'not found' }));
    },
    error => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    },
  );
}).listen(3030);
