import { showReportDialog } from '@sentry/nextjs';

const ReportDialogPage = (): JSX.Element => (
  <button
    onClick={() => {
      showReportDialog();
    }}
  >
    Open Report Dialog
  </button>
);

export default ReportDialogPage;
