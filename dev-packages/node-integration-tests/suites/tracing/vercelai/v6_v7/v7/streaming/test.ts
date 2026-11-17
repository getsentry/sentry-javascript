import { describe } from 'vitest';
import { registerVercelAiStreamingTests } from '../../suite';

describe('Vercel AI integration (version 7)', () => {
  registerVercelAiStreamingTests('7', '^7.0.0');
});
