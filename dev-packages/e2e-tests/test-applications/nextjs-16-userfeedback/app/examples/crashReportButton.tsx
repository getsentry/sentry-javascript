'use client';

import * as Sentry from '@sentry/nextjs';

export default function CrashReportButton() {
  return (
    <button
      className="hover:bg-hover px-4 py-2 rounded-md"
      type="button"
      data-testid="crash-report-button"
      onClick={() => {
        Sentry.captureException(new Error('Crash Report Button Clicked'), {
          data: { useCrashReport: true },
        });
      }}
    >
      Crash Report
    </button>
  );
}
