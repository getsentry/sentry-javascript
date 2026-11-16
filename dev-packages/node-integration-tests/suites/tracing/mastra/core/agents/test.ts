import { describe } from 'vitest';
import { supports } from '../../../../../utils';
import { registerMastraAgentTests } from '../../suite';

describe.runIf(supports({ min: 22 }))('Mastra integration', registerMastraAgentTests);
