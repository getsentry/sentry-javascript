import { describe } from 'vitest';
import {
  registerVercelAiGenerationTests,
  registerDecideTests,
  registerRuntimeTests,
  registerRecordingOffTests,
} from '../../suite';

describe('Vercel AI integration (version 7)', () => {
  registerVercelAiGenerationTests('7', '^7.0.0');
});

describe('Vercel AI integration experimental_decide', registerDecideTests);

describe('Vercel AI runtime and tool context (v7)', registerRuntimeTests);

describe('Vercel AI calls with recording off (v7)', registerRecordingOffTests);
