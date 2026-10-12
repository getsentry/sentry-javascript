import { experimental_evaluate } from 'ai';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

// Runs a TypeSafe Jev evaluation so the e2e test can assert its `gen_ai.evaluate` span. The model is
// mocked because the e2e environment has no TypeSafe credentials.
const jev = new Experimental_EvaluationMockModelV4({
  provider: 'gateway',
  modelId: 'typesafe-ai/jev',
  doEvaluate: async () => ({
    answers: {
      wantsRefund: { type: 'boolean', probability: 0.99 },
      department: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.64, technical: 0.36 },
      },
    },
    usage: { inputTokens: 275, outputTokens: 20 },
    warnings: [],
  }),
});

export default defineTool({
  description: 'Classify a support ticket. Call this when asked to classify a ticket.',
  inputSchema: z.object({ ticket: z.string().min(1) }),
  async execute({ ticket }) {
    const { answers } = await experimental_evaluate({
      model: jev,
      state: ticket,
      questions: {
        wantsRefund: { type: 'boolean', instructions: 'Is a refund requested?' },
        department: {
          type: 'choice',
          instructions: 'Which team should handle this?',
          criteria: { billing: 'Charges and refunds', technical: 'Bugs and outages' },
        },
      },
    });
    return answers;
  },
});
