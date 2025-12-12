import { captureException, showReportDialog } from '@sentry/nextjs';

export default function ReportDialogPage() {
  return (
    <button
      id="open-report-dialog"
      onClick={() => {
        const eventId = captureException(new Error('show-report-dialog-error'));
        showReportDialog({ eventId });
      }}
    >
      Open Report Dialog
    </button>
  );
}
