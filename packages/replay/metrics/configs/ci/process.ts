import path from 'path';
import { ResultsAnalyzer } from '../../src/results/analyzer.js';
import { PrCommentBuilder } from '../../src/results/pr-comment.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { Git } from '../../src/util/git.js';
import { GitHub } from '../../src/util/github.js';
import { latestResultFile, previousResultsDir, baselineResultsDir, artifactName } from './env.js';

const latestResult = Result.readFromFile(latestResultFile);

await GitHub.downloadPreviousArtifact(await Git.baseBranch, baselineResultsDir, artifactName);
await GitHub.downloadPreviousArtifact(await Git.branch, previousResultsDir, artifactName);

GitHub.writeOutput("artifactName", artifactName)
GitHub.writeOutput("artifactPath", path.resolve(previousResultsDir));

const previousResults = new ResultsSet(previousResultsDir);

const prComment = new PrCommentBuilder();
if (Git.baseBranch != Git.branch) {
  const baseResults = new ResultsSet(baselineResultsDir);
  await prComment.addCurrentResult(await ResultsAnalyzer.analyze(latestResult, baseResults), "Baseline");
  await prComment.addAdditionalResultsSet(
    `Baseline results on branch: ${Git.baseBranch}`,
    // We skip the first one here because it's already included as `Baseline` column above in addCurrentResult().
    baseResults.items().slice(1, 10)
  );
} else {
  await prComment.addCurrentResult(await ResultsAnalyzer.analyze(latestResult, previousResults), "Previous");
}

await prComment.addAdditionalResultsSet(
  `Previous results on branch: ${Git.branch}`,
  previousResults.items().slice(0, 10)
);

await GitHub.addOrUpdateComment(prComment);

// Copy the latest test run results to the archived result dir.
await previousResults.add(latestResultFile, true);
