/* eslint-disable no-console */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { schema } from '@stryker-mutator/api/core';

import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://cdae3f96df86224530838d318d268f62@o447951.ingest.us.sentry.io/4507814527303680',
  tracesSampleRate: 1.0,
  defaultIntegrations: false,

  environment: process.env.CI ? 'ci' : 'local',
  release: child_process.execSync('git rev-parse HEAD').toString().trim(),

  beforeSendTransaction(transaction) {
    console.log('Sending transaction to Sentry:', transaction);
    return transaction;
  },
});

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
  const results = mutationResults.map(getMutationTestResultAggregation).sort((a, b) => b.score - a.score);
  console.table(results);
  sendResultsToSentry(results);
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
    // biome-ignore lint/performance/noAccumulatingSpread: <explanation>
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
    score: Math.round((detected / (total - ignored) + Number.EPSILON) * 100) / 100,
    scoreCovered: Math.round((detected / (total - ignored - noCoverage) + Number.EPSILON) * 100) / 100,
    detected,
    undetected: survived + noCoverage,
    killed,
    survived,
    noCoverage,
    ignored,
    error,
    timeout,
    total,
  };
}

// sentry-trace header: uuid{32}-uuid{16}-bool{1}:
// 8e6b2b4a9e9a4b7b9e9b9e9a9e9b9e9a-8e6b2b4a9e9a4b7b-1

function sendResultsToSentry(mutationResults: MutationTestResultAggregation[]): void {
  Sentry.continueTrace(
    {
      sentryTrace: '8e6b2b4a9e9a4b7b9e9b9e9a9e9b9e9a-8e6b2b4a9e9a4b7b-1',
      baggage: 'sentry-trace_id=8e6b2b4a9e9a4b7b9e9b9e9a9e9b9e9a',
    },
    () => {
      mutationResults.forEach(res => {
        Sentry.withScope(scope => {
          Sentry.startSpanManual({ name: res.package, op: 'test' }, rootSpan => {
            scope.setTag('mutation.score', res.score);
            scope.setTag('mutation.package', res.package);
            Sentry.setMeasurement('mutation.score', res.score, 'ratio');
            rootSpan.end();
          });
        });
      });
    },
  );
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
