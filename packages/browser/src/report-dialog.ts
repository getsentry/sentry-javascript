import type { ReportDialogOptions } from '@sentry/core';
import { debug, getClient, getCurrentScope, getReportDialogEndpoint, lastEventId } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';
import { WINDOW } from './helpers';

/**
 * Present the user with a report dialog.
 *
 * @param options Everything is optional, we try to fetch all info need from the current scope.
 */
export function showReportDialog(options: ReportDialogOptions = {}): void {
  const optionalDocument = WINDOW.document as Document | undefined;
  const injectionPoint = optionalDocument?.head || optionalDocument?.body;

  // doesn't work without a document (React Native)
  if (!injectionPoint) {
    DEBUG_BUILD && debug.error('[showReportDialog] Global document not defined');
    return;
  }

  const scope = getCurrentScope();
  const client = getClient();
  const dsn = client?.getDsn();

  if (!dsn) {
    DEBUG_BUILD && debug.error('[showReportDialog] DSN not configured');
    return;
  }

  const mergedOptions = {
    ...options,
    user: {
      ...scope.getUser(),
      ...options.user,
    },
    eventId: options.eventId || lastEventId(),
  };

  const script = WINDOW.document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = getReportDialogEndpoint(dsn, mergedOptions);

  const { onLoad, onClose } = mergedOptions;

  if (onLoad) {
    script.onload = onLoad;
  }

  if (onClose) {
    const reportDialogClosedMessageHandler = (event: MessageEvent): void => {
      if (event.data === '__sentry_reportdialog_closed__') {
        try {
          onClose();
        } finally {
          WINDOW.removeEventListener('message', reportDialogClosedMessageHandler);
        }
      }
    };
    WINDOW.addEventListener('message', reportDialogClosedMessageHandler);
  }

  injectionPoint.appendChild(script);
}
