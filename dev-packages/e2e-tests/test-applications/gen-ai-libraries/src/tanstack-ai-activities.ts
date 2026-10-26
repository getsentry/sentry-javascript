// The TanStack AI activities other than `chat()`, run against OpenRouter like the libraries in
// `libraries.ts`. The embedding adapter calls the OpenAI SDK, whose Sentry integration TanStack AI skips
// only during its own call, so the `openai` tests that run later still get their spans.
import { boolean, choice, decide, embed, rerank } from '@tanstack/ai';
import { createOpenaiEmbedding } from '@tanstack/ai-openai';
import { createOpenRouterDecider, createOpenRouterRerank } from '@tanstack/ai-openrouter';

export interface TanstackAiActivity {
  id: string;
  run: (apiKey: string) => Promise<unknown>;
}

export const tanstackAiActivities: TanstackAiActivity[] = [
  {
    id: 'embed',
    run: async apiKey => {
      const { embeddings } = await embed({
        // OpenRouter names the model with its vendor, which the model type of the adapter does not allow.
        adapter: createOpenaiEmbedding('openai/text-embedding-3-small' as 'text-embedding-3-small', apiKey, {
          baseURL: 'https://openrouter.ai/api/v1',
        }),
        input: ['a red guitar', 'a blue drum kit'],
      });
      return embeddings.length;
    },
  },
  {
    id: 'decide',
    run: async apiKey => {
      const result = await decide({
        adapter: createOpenRouterDecider('~typesafe/jev-latest', apiKey),
        state: 'I was charged twice for my subscription.',
        questions: {
          queue: choice({ instructions: 'Which team handles this ticket?', options: { billing: null, tech: null } }),
          refund: boolean({ instructions: 'Does the customer ask for a refund?' }),
        },
      });
      return { queue: result.queue.value, refund: result.refund.value };
    },
  },
  {
    id: 'rerank',
    run: async apiKey => {
      const { ranking } = await rerank({
        adapter: createOpenRouterRerank('cohere/rerank-v3.5', apiKey),
        query: 'A laptop for travel',
        documents: ['A heavy gaming desktop', 'A lightweight ultrabook with all-day battery'],
      });
      return ranking.map(entry => entry.index);
    },
  },
];
