// `instrument.mjs` is imported for its side effect in the prod bundle; in dev `--import` has already
// run it, and a second import is a no-op because ES modules are evaluated once.
import './instrument.mjs';

import { Mistral } from '@mistralai/mistralai';
import * as Sentry from '@sentry/node';
import DataLoader from 'dataloader';
import express from 'express';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

// The Mistral SDK talks to OpenRouter rather than api.mistral.ai, so the suite needs only the one
// OpenRouter key the other AI e2e apps already use. OpenRouter serves an OpenAI-compatible
// `/v1/chat/completions`, which is the endpoint `chat.complete` and `chat.stream` post to, and the
// SDK's response schemas are lenient enough to accept it (`usage` has a `catchall`, `finish_reason`
// is an open enum). What is under test is the SDK's own code path, which is what Sentry instruments.
const client = new Mistral({ apiKey, serverURL: 'https://openrouter.ai/api' });

// Same model the eve and mastra apps drive through this key. The model is incidental here; the
// Mistral SDK request/response path is the thing being instrumented.
const MODEL = 'openai/gpt-4o-mini';

// Kept short so a live model stays cheap and quick, and so streamed responses still arrive in more
// than one chunk.
const SHORT_ANSWER = 'Answer in at most five words.';

const userLoader = new DataLoader(async keys => keys.map(key => ({ id: key, name: `user-${key}` })));

async function main() {
  const port = Number(process.env.PORT ?? 3030);
  const app = express();

  app.get('/chat', async (req, res) => {
    // A manual span wrapping the SDK call: the gen_ai span has to nest inside this one, and this one
    // has to nest inside the auto-instrumented request span.
    const answer = await Sentry.startSpan({ name: 'ai-workflow', op: 'function' }, async () => {
      const completion = await client.chat.complete({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a helpful assistant used by an automated test.' },
          { role: 'user', content: `What is the capital of France? ${SHORT_ANSWER}` },
        ],
        temperature: 0,
        maxTokens: 32,
      });

      // A manual sibling of the gen_ai span, so the assertions can tell "child of the manual span"
      // apart from "child of whatever ran last".
      return Sentry.startSpan(
        { name: 'post-process', op: 'function' },
        () => completion.choices?.[0]?.message?.content ?? '',
      );
    });

    res.send({ answer });
  });

  app.get('/chat-stream', async (req, res) => {
    const chunks = [];

    await Sentry.startSpan({ name: 'ai-stream-workflow', op: 'function' }, async () => {
      const stream = await client.chat.stream({
        model: MODEL,
        messages: [{ role: 'user', content: `Name three colours. ${SHORT_ANSWER}` }],
        temperature: 0,
        maxTokens: 32,
      });

      for await (const event of stream) {
        const content = event.data?.choices?.[0]?.delta?.content;
        if (typeof content === 'string') {
          chunks.push(content);
        }
      }
    });

    res.send({ answer: chunks.join('') });
  });

  // `tee()` acquires its reader through internal slots rather than the public `getReader`, so it is
  // the drain path most likely to escape instrumentation. Both branches are drained so the response
  // only comes back once the stream is finished.
  app.get('/chat-stream-tee', async (req, res) => {
    const branches = await Sentry.startSpan({ name: 'ai-tee-workflow', op: 'function' }, async () => {
      const stream = await client.chat.stream({
        model: MODEL,
        messages: [{ role: 'user', content: `Name three colours. ${SHORT_ANSWER}` }],
        temperature: 0,
        maxTokens: 32,
      });

      const [left, right] = stream.tee();

      const drain = async branch => {
        const parts = [];
        for await (const event of branch) {
          const content = event.data?.choices?.[0]?.delta?.content;
          if (typeof content === 'string') {
            parts.push(content);
          }
        }
        return parts.join('');
      };

      return Promise.all([drain(left), drain(right)]);
    });

    res.send({ left: branches[0], right: branches[1] });
  });

  // Relays the stream through a transform, the shape an edge handler would use to forward tokens.
  app.get('/chat-stream-pipe', async (req, res) => {
    const answer = await Sentry.startSpan({ name: 'ai-pipe-workflow', op: 'function' }, async () => {
      const stream = await client.chat.stream({
        model: MODEL,
        messages: [{ role: 'user', content: `Name three colours. ${SHORT_ANSWER}` }],
        temperature: 0,
        maxTokens: 32,
      });

      const relayed = stream.pipeThrough(
        new TransformStream({
          transform(event, controller) {
            controller.enqueue(event.data?.choices?.[0]?.delta?.content ?? '');
          },
        }),
      );

      const parts = [];
      for await (const part of relayed) {
        parts.push(part);
      }
      return parts.join('');
    });

    res.send({ answer });
  });

  // A model id the upstream will reject, so the failure is a real API error rather than a simulated
  // one. The caller-supplied id makes each request identifiable in the spans it produces.
  app.get('/chat-error', async (req, res, next) => {
    const model = `no-such-model/${req.query.id ?? 'default'}`;

    try {
      await client.chat.complete({ model, messages: [{ role: 'user', content: 'This will fail' }] });
      res.send({ ok: true });
    } catch (error) {
      // Rethrown through the express error handler so the SDK captures it the way a real app would.
      next(new Error(`Mistral call failed for ${model}: ${error.message}`));
    }
  });

  // A dataloader (orchestrion-instrumented, like Mistral) and a Mistral call in one request, so the
  // assertions can prove both sets of spans land in the same trace.
  app.get('/dataloader-and-chat', async (req, res) => {
    const user = await userLoader.load(`${req.query.id ?? '1'}`);

    const completion = await client.chat.complete({
      model: MODEL,
      messages: [{ role: 'user', content: `Say hello to ${user.name}. ${SHORT_ANSWER}` }],
      temperature: 0,
      maxTokens: 32,
    });

    res.send({ user, answer: completion.choices?.[0]?.message?.content ?? '' });
  });

  Sentry.setupExpressErrorHandler(app);

  app.use((error, req, res, _next) => {
    res.status(500).send({ message: error.message });
  });

  app.listen(port);
}

void main();
