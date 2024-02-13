import { captureException, showReportDialog } from '@sentry/nextjs';

const ReportDialogPage = (): JSX.Element => (
  <button
    onClick={() => {
      const eventId = captureException(new Error('show-report-dialog-error'));
      showReportDialog({ eventId });
    }}
  >
    Open Report Dialog
  </button>
);

export default ReportDialogPage;
