const replacements: [string, string][] = [
  ['january', '1'],
  ['february', '2'],
  ['march', '3'],
  ['april', '4'],
  ['may', '5'],
  ['june', '6'],
  ['july', '7'],
  ['august', '8'],
  ['september', '9'],
  ['october', '10'],
  ['november', '11'],
  ['december', '12'],
  ['jan', '1'],
  ['feb', '2'],
  ['mar', '3'],
  ['apr', '4'],
  ['may', '5'],
  ['jun', '6'],
  ['jul', '7'],
  ['aug', '8'],
  ['sep', '9'],
  ['oct', '10'],
  ['nov', '11'],
  ['dec', '12'],
  ['sunday', '0'],
  ['monday', '1'],
  ['tuesday', '2'],
  ['wednesday', '3'],
  ['thursday', '4'],
  ['friday', '5'],
  ['saturday', '6'],
  ['sun', '0'],
  ['mon', '1'],
  ['tue', '2'],
  ['wed', '3'],
  ['thu', '4'],
  ['fri', '5'],
  ['sat', '6'],
];

/**
 * Replaces names in cron expressions
 */
export function replaceCronNames(cronExpression: string): string {
  return replacements.reduce(
    // eslint-disable-next-line @sentry-internal/sdk/no-regexp-constructor
    (acc, [name, replacement]) => acc.replace(new RegExp(name, 'gi'), replacement),
    cronExpression,
  );
}
