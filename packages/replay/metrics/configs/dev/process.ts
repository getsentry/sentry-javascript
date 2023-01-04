import { AnalyzerItemMetric, ResultsAnalyzer } from '../../src/results/analyzer.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { latestResultFile, outDir } from './env.js';

const resultsSet = new ResultsSet(outDir);
const latestResult = Result.readFromFile(latestResultFile);

const analysis = await ResultsAnalyzer.analyze(latestResult, resultsSet);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table: { [k: string]: any } = {};
for (const item of analysis.items) {
  table[AnalyzerItemMetric[item.metric]] = {
    value: item.value.asString(),
    ...((item.other == undefined) ? {} : {
      previous: item.other.asString()
    })
  };
}
console.table(table);

await resultsSet.add(latestResultFile, true);
