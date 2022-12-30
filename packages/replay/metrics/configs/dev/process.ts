import { AnalyzerItemMetric, ResultsAnalyzer } from '../../src/results/analyzer.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { latestResultFile, outDir } from './env.js';

const resultsSet = new ResultsSet(outDir);
const latestResult = Result.readFromFile(latestResultFile);

const analysis = ResultsAnalyzer.analyze(latestResult, resultsSet);

const table: { [k: string]: any } = {};
for (const item of analysis) {
  const printable: { [k: string]: any } = {};
  printable.value = item.value.asString();
  if (item.other != undefined) {
    printable.baseline = item.other.asString();
  }
  table[AnalyzerItemMetric[item.metric]] = printable;
}
console.table(table);

await resultsSet.add(latestResultFile, true);
