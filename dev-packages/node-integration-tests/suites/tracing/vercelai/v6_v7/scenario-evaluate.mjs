import * as Sentry from '@sentry/node';
import { experimental_evaluate } from 'ai';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';

async function run() {
  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    await experimental_evaluate({
      model: new Experimental_EvaluationMockModelV4({
        provider: 'gateway',
        modelId: 'typesafe-ai/jev',
        doEvaluate: async () => ({
          answers: {
            authIssue: { type: 'boolean', probability: 0.97 },
            department: {
              type: 'choice',
              choice: 'billing',
              probabilities: { billing: 0.64, technical: 0.36 },
            },
            wantsRefund: { type: 'boolean', probability: 0.99 },
            urgency: { type: 'score', score: 1.8, probabilities: { 0: 0, 1: 0.2, 2: 0.8 } },
          },
          usage: { inputTokens: 275, outputTokens: 20 },
          // What the AI SDK TypeSafe provider returns: answer confidence moves into provider metadata.
          providerMetadata: { typesafe: { confidence: { department: 0.28 } } },
          warnings: [],
        }),
      }),
      state: 'I cannot log in, and I also want a refund for last month.',
      questions: {
        authIssue: { type: 'boolean', instructions: 'Is there a login problem?' },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
        },
        wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' },
        urgency: { type: 'score', instructions: 'How urgent is this ticket?', criteria: ['low', 'medium', 'high'] },
      },
    });
  });
}

run();
