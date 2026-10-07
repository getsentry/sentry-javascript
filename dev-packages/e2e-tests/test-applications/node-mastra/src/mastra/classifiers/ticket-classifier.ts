import { Classifier } from '@mastra/core/classifier';
import { openrouter } from '../openrouter.js';

export const TICKET_CLASSIFIER = 'ticketClassifier';

// A Jev evaluation through OpenRouter's Decisions API. `Classifier` calls the model's `doEvaluate()`
// directly, so its span comes from the Mastra exporter, not from the Vercel AI integration.
export const ticketClassifier = new Classifier({
  id: TICKET_CLASSIFIER,
  model: openrouter.evaluationModel('typesafe/jev-1.13'),
  questions: {
    is_bug: {
      type: 'boolean',
      instructions: 'Is the customer reporting a software defect?',
    },
  },
});
