import path from 'path';
// import { AnalyzerItemMetric, ResultsAnalyzer } from '../../src/results/analyzer.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { Git } from '../../src/util/git.js';
import { GitHub } from '../../src/util/github.js';
import { latestResultFile, previousResultsDir, baselineResultsDir, artifactName } from './env.js';

const latestResult = Result.readFromFile(latestResultFile);
console.debug(latestResult);

GitHub.downloadPreviousArtifact(await Git.baseBranch, baselineResultsDir, artifactName);
GitHub.downloadPreviousArtifact(await Git.branch, previousResultsDir, artifactName);

GitHub.writeOutput("artifactName", artifactName)
GitHub.writeOutput("artifactPath", path.resolve(previousResultsDir));

const resultsSet = new ResultsSet(previousResultsDir);
// const analysis = ResultsAnalyzer.analyze(latestResult, resultsSet);

// val prComment = PrCommentBuilder()
// prComment.addCurrentResult(latestResults)
// if (Git.baseBranch != Git.branch) {
//   prComment.addAdditionalResultsSet(
//     "Baseline results on branch: ${Git.baseBranch}",
//     ResultsSet(baselineResultsDir)
//   )
// }
// prComment.addAdditionalResultsSet(
//   "Previous results on branch: ${Git.branch}",
//   ResultsSet(previousResultsDir)
// )

// GitHub.addOrUpdateComment(prComment);

// Copy the latest test run results to the archived result dir.
await resultsSet.add(latestResultFile, true);
