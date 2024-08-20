/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { schema } from '@stryker-mutator/api/core';

interface MutationTestResultAggregation {
  package: string;
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  ignored: number;
  error: number;
  detected: number;
  undetected: number;
  total: number;
  score: number;
  scoreCovered: number;
}

function main(): void {
  const mutationResults: schema.MutationTestResult[] = getMutationTestResults();
  console.table(mutationResults.map(getMutationTestResultAggregation));
}

function getMutationTestResults(): schema.MutationTestResult[] {
  const packagesDir = path.resolve(path.join(process.cwd(), 'packages'));

  const packages = fs
    .readdirSync(packagesDir)
    .map(packageDir => path.resolve(path.join(packagesDir, packageDir)))
    .filter(dir => fs.statSync(dir).isDirectory())
    .filter(dir => fs.existsSync(path.join(dir, 'reports')));

  const strykerReportJsonFiles = packages
    .map(dir => path.join(dir, 'reports', 'mutation', 'mutation.json'))
    .filter(fs.existsSync);

  const mutationResults: schema.MutationTestResult[] = strykerReportJsonFiles.map(
    file => JSON.parse(fs.readFileSync(file, 'utf-8')) as schema.MutationTestResult,
  );
  return mutationResults;
}

function getMutationTestResultAggregation(mutationResults: schema.MutationTestResult): MutationTestResultAggregation {
  const total = Object.values(mutationResults.files).reduce((acc, file) => acc + file.mutants.length, 0);
  const allMutants = Object.values(mutationResults.files).reduce(
    (acc, file) => [...acc, ...file.mutants],
    [] as schema.MutantResult[],
  );

  const noCoverage = allMutants.filter(mutant => mutant.status === 'NoCoverage').length;
  const killed = allMutants.filter(mutant => mutant.status === 'Killed').length;
  const survived = allMutants.filter(mutant => mutant.status === 'Survived').length;
  const error = allMutants.filter(
    mutant => mutant.status === 'RuntimeError' || mutant.status === 'CompileError',
  ).length;
  const ignored = allMutants.filter(mutant => mutant.status === 'Ignored').length;
  const timeout = allMutants.filter(mutant => mutant.status === 'Timeout').length;

  const detected = killed + timeout;

  return {
    package: getPackageName(mutationResults),
    killed,
    survived,
    noCoverage,
    ignored,
    error,
    timeout,
    total,
    detected,
    undetected: survived + noCoverage,
    score: Math.fround(detected / (total - ignored)),
    scoreCovered: Math.fround(detected / (total - ignored - noCoverage)),
  };
}

function getPackageName(mutationResults: schema.MutationTestResult): string {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(mutationResults.projectRoot ?? '', 'package.json')).toString()) as {
        name: string;
      }
    ).name;
  } catch {
    return mutationResults.projectRoot || 'unknown';
  }
}

main();
