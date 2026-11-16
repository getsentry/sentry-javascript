import { describe } from 'vitest';
import { supports } from '../../../../utils';
import { registerMastraNestingTests } from '../suite';

describe.runIf(supports({ min: 22 }))('Mastra integration', registerMastraNestingTests);
