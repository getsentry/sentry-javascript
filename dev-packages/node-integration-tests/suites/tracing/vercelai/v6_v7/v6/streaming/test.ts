import { describe } from 'vitest';
import { registerVercelAiStreamingTests } from '../../suite';

describe('Vercel AI integration (version 6)', () => {
  registerVercelAiStreamingTests('6', '^6.0.0');
});
