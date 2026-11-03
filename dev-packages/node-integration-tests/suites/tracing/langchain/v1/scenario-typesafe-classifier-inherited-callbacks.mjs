import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { RunnableLambda } from '@langchain/core/runnables';
import { TypeSafeClassifier } from '@langchain/typesafe';
// Sets up the AsyncLocalStorage that passes a parent run's config to its children, as it is inside `createAgent`.
import '@langchain/langgraph';
import * as Sentry from '@sentry/node';
import express from 'express';

function startMockTypeSafeServer() {
  const app = express();
  app.use(express.json());

  app.post('/v1/systemone', (req, res) => {
    res.json({
      model: 'jev-1.13',
      answers: { urgent: { type: 'noul', noul: 0.9 } },
      usage: { input_tokens: 30, output_tokens: 2 },
    });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

// Stands in for a tracer such as LangSmith, which the user passes to the parent run.
class RecordingHandler extends BaseCallbackHandler {
  name = 'RecordingHandler';
  runs = [];

  handleChainStart(chain, _inputs, _runId, parentRunId) {
    this.runs.push(`${chain.id.at(-1)}:${parentRunId ? 'child' : 'root'}`);
  }
}

async function run() {
  const server = await startMockTypeSafeServer();
  const baseUrl = `http://localhost:${server.address().port}`;

  await Sentry.startSpan({ op: 'function', name: 'main' }, async span => {
    const classifier = new TypeSafeClassifier({
      apiKey: 'mock-api-key',
      baseUrl,
      questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
    });

    // Like the `@langchain/typesafe` middlewares, call the classifier without a config.
    const parent = RunnableLambda.from(input => classifier.invoke(input)).withConfig({ runName: 'parent' });
    const recorder = new RecordingHandler();
    await parent.invoke('My payouts have been failing.', { callbacks: [recorder] });

    span.setAttribute('test.recorded_runs', recorder.runs.join(','));
  });

  await Sentry.flush(2000);
  server.close();
}

run();
