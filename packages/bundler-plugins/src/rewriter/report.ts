/** What a rewrite did with the sites it found, by site label. */
export interface RewriteReport {
  wrapped: string[];
  /** Sites the rewrite could not wrap, for the user to wrap by hand. */
  skipped: string[];
  /** Sites the user already wrapped. */
  alreadyWrapped: string[];
}

export function createReport(): RewriteReport {
  return { wrapped: [], skipped: [], alreadyWrapped: [] };
}

/** The warning for the skipped sites of a module, or `undefined` when none were skipped. */
export function formatReport(report: RewriteReport, id: string): string | undefined {
  if (report.skipped.length === 0) return undefined;
  return `[Sentry] Could not auto-instrument ${report.skipped.join(' and ')} in ${id}.`;
}
