import { HumanMessage } from '@langchain/core/messages';
import { TypeSafeClassifier } from '@langchain/typesafe';

const mockFetch: typeof fetch = async () =>
  Response.json({
    model: 'jev-1.13',
    answers: { urgent: { type: 'noul', noul: 0.9 } },
    usage: { input_tokens: 30, output_tokens: 2 },
  });

export default {
  async fetch() {
    const classifier = new TypeSafeClassifier({
      apiKey: 'mock-api-key',
      fetch: mockFetch,
      questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } },
    });

    const result = await classifier.invoke([new HumanMessage('My payouts have been failing.')]);

    return Response.json(result);
  },
} satisfies ExportedHandler;
