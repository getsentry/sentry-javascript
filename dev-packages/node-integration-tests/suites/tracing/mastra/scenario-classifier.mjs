import * as Sentry from '@sentry/node';
import { Mastra } from '@mastra/core';
import { Classifier } from '@mastra/core/classifier';
import { Observability } from '@mastra/observability';
import { SentryMastraExporter } from '@sentry/node';

// Inlined `EvaluationModelV4` mock: the ESM/CJS runner copies only this file into its temp dir.
const evaluationModel = {
  specificationVersion: 'v4',
  provider: 'typesafe-ai.evaluation',
  modelId: 'jev-latest',
  supportedQuestionTypes: ['choice', 'score', 'boolean'],
  async doEvaluate() {
    return {
      answers: { urgent: { type: 'boolean', probability: 0.9 } },
      usage: { inputTokens: 30, outputTokens: 2 },
      warnings: [],
    };
  },
};

async function run() {
  const classifier = new Classifier({
    id: 'request-classifier',
    model: evaluationModel,
    questions: { urgent: { type: 'boolean', instructions: 'Does this request need an immediate response?' } },
  });

  const mastra = new Mastra({
    classifiers: { classifier },
    logger: false,
    observability: new Observability({
      configs: {
        default: {
          serviceName: 'mastra-test',
          exporters: [new SentryMastraExporter()],
        },
      },
    }),
  });

  await Sentry.startSpan({ op: 'function', name: 'mastra-test' }, async () => {
    await mastra
      .getClassifier('classifier')
      .evaluate({ state: { message: 'I was charged twice.', apiKey: 'sk-test-123' } });
  });

  await mastra.observability.shutdown();
}

run();
