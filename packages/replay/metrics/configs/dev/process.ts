import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { latestResultFile, outDir } from './env.js';

const resultsSet = new ResultsSet(outDir);

const latestResult = Result.readFromFile(latestResultFile);
console.log(latestResult);

await resultsSet.add(latestResultFile);
