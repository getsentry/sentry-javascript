import { ResultsAnalyzer } from '../../src/results/analyzer.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { printAnalysis } from '../../src/util/console.js';
import { latestResultFile, outDir } from './env.js';

const resultsSet = new ResultsSet(outDir);
const latestResult = Result.readFromFile(latestResultFile);

const analysis = await ResultsAnalyzer.analyze(latestResult, resultsSet);
printAnalysis(analysis);

await resultsSet.add(latestResultFile, true);
