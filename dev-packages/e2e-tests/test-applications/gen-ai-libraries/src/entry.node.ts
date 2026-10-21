// `instrument.node.ts` is preloaded via `node --import`, so Sentry is already initialised here.
import * as Sentry from '@sentry/node';
import express from 'express';
import { libraries } from './libraries';

const apiKey = process.env.E2E_OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('E2E_OPENROUTER_API_KEY is not set');
}

const app = express();

// One `/:lib/chat` and `/:lib/tools` per instrumented library. Each SDK call is wrapped in a manual
// `ai-workflow` span, so the gen_ai span nests inside it, and it inside the auto-instrumented request
// span.
for (const library of libraries) {
  app.get(`/${library.id}/chat`, async (_req, res, next) => {
    try {
      const answer = await Sentry.startSpan({ name: 'ai-workflow', op: 'function' }, () => library.chat(apiKey));
      res.send({ answer });
    } catch (error) {
      next(error);
    }
  });

  app.get(`/${library.id}/tools`, async (_req, res, next) => {
    try {
      const toolCalls = await Sentry.startSpan({ name: 'ai-tool-workflow', op: 'function' }, () =>
        library.tools(apiKey),
      );
      res.send({ toolCalls });
    } catch (error) {
      next(error);
    }
  });
}

Sentry.setupExpressErrorHandler(app);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).send({ message: error.message });
});

const port = Number(process.env.PORT ?? 3030);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`gen-ai-libraries (Node) listening on port ${port}`);
});
