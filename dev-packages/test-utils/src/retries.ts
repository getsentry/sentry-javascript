/**
 * Returns how often a failed test should be retried: once on PRs, never anywhere else.
 * Flaky tests keep failing on develop, where the weekly flaky test report looks for them.
 */
export function getTestRetries(): number {
  return process.env.GITHUB_EVENT_NAME === 'pull_request' ? 1 : 0;
}
