import { ResultsSet } from '../../src/results/results-set.js';
import { latestResultFile, outDir } from './env.js';

const resultsSet = new ResultsSet(outDir);
await resultsSet.add(latestResultFile);
