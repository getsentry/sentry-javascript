import { describe } from 'vitest';
import { supports } from '../../../../utils';
import { registerMastraCoreTests } from '../suite';

describe.runIf(supports({ min: 22 }))('Mastra integration', registerMastraCoreTests);
