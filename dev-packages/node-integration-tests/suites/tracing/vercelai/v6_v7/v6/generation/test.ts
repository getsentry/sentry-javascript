import { describe } from 'vitest';
import { registerVercelAiGenerationTests, registerMetadataTests } from '../../suite';

describe('Vercel AI integration (version 6)', () => {
  registerVercelAiGenerationTests('6', '^6.0.0');
});

describe('Vercel AI telemetry metadata (v6)', registerMetadataTests);
