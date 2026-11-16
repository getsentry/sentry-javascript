import { describe } from 'vitest';
import { supports } from '../../../../utils';
import { registerMastraClassifierTests } from '../suite';

describe.runIf(supports({ min: 22 }))('Mastra integration', registerMastraClassifierTests);
