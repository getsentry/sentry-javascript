// `instrument.ts` is preloaded via `node --import`, so Sentry is already initialised here.
import * as Sentry from '@sentry/node';
import express from 'express';
import OpenAI from 'openai';

// OpenRouter has no `/decisions` route, so this app calls OpenAI directly. CI only passes this key to
// this app.
const apiKey = process.env.E2E_OPENAI_DECISIONS_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENAI_DECISIONS_API_KEY is not set');
}

const client = new OpenAI({ apiKey });

const MODEL = 'gpt-6-luna';

// A 1x1 red PNG, so the image request is cheap.
const RED_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

const app = express();

/** The trace this request is recorded under, so the test can look its spans up in Sentry. */
function currentTraceId(): string | undefined {
  return Sentry.getActiveSpan()?.spanContext().traceId;
}

// Each route makes one `decisions.create` call and answers with the trace id, so the test can find
// the request's spans in Sentry.

app.get('/decide', async (_req, res, next) => {
  try {
    const decision = await client.decisions.create({
      model: MODEL,
      input: 'I was charged twice this month and want a refund.',
      questions: [
        { type: 'predicate', name: 'wants_refund', instructions: 'Is a refund requested?' },
        {
          type: 'choice',
          name: 'department',
          instructions: 'Which team should handle this?',
          choices: [
            { value: 'billing', description: 'Charges and refunds' },
            { value: 'other', description: 'Anything else' },
          ],
        },
        {
          type: 'score',
          name: 'urgency',
          instructions: 'How urgent is this ticket?',
          levels: [{ label: 'low' }, { label: 'high' }],
        },
      ],
    });
    res.send({ traceId: currentTraceId(), answers: decision.answers });
  } catch (error) {
    next(error);
  }
});

app.get('/decide-image', async (_req, res, next) => {
  try {
    const decision = await client.decisions.create({
      model: MODEL,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Is this image mostly red?' },
            { type: 'input_image', image_url: RED_PIXEL },
          ],
        },
      ],
      questions: [{ type: 'predicate', name: 'is_red', instructions: 'Is the image mostly red?' }],
    });
    res.send({ traceId: currentTraceId(), answers: decision.answers });
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).send({ message: error.message });
});

const port = Number(process.env.PORT ?? 3030);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`node-openai-decisions-send-to-sentry listening on port ${port}`);
});
