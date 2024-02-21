import path from 'path';
import fs from 'fs-extra';

import { ResultsAnalyzer } from '../../src/results/analyzer.js';
import { PrCommentBuilder } from '../../src/results/pr-comment.js';
import { Result } from '../../src/results/result.js';
import { ResultsSet } from '../../src/results/results-set.js';
import { Git } from '../../src/util/git.js';
import { GitHub } from '../../src/util/github.js';
import { artifactName, baselineResultsDir, latestResultFile, previousResultsDir } from './env.js';

const latestResult = Result.readFromFile(latestResultFile);
const branch = await Git.branch;
const baseBranch = await Git.baseBranch;
const branchIsBase = await Git.branchIsBase;

await GitHub.downloadPreviousArtifact(baseBranch, baselineResultsDir, artifactName);

if (branchIsBase) {
  await GitHub.downloadPreviousArtifact(branch, previousResultsDir, artifactName);
} else {
  // Copy over same results
  await fs.copy(baselineResultsDir, previousResultsDir);
}

GitHub.writeOutput('artifactName', artifactName);
GitHub.writeOutput('artifactPath', path.resolve(previousResultsDir));

const previousResults = new ResultsSet(previousResultsDir);

const prComment = new PrCommentBuilder();
if (baseBranch != branch) {
  const baseResults = new ResultsSet(baselineResultsDir);
  await prComment.addCurrentResult(await ResultsAnalyzer.analyze(latestResult, baseResults), 'Baseline');
  await prComment.addAdditionalResultsSet(
    `Baseline results on branch: <code>${baseBranch}</code>`,
    // We skip the first one here because it's already included as `Baseline` column above in addCurrentResult().
    baseResults
      .items()
      .slice(1, 10),
  );
} else {
  await prComment.addCurrentResult(await ResultsAnalyzer.analyze(latestResult, previousResults), 'Previous');
}

await prComment.addAdditionalResultsSet(
  `Previous results on branch: <code>${branch}</code>`,
  previousResults.items().slice(0, 10),
);

await GitHub.addOrUpdateComment(prComment);

// Copy the latest test run results to the archived result dir.
await previousResults.add(latestResultFile, true);
