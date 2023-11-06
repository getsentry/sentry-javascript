import type { TransportMakeRequestResponse } from '@sentry/types';
import { logger } from '@sentry/utils';

import { sendFeedback } from '../sendFeedback';
import type { FeedbackFormData, SendFeedbackOptions } from '../types';
import type { DialogComponent } from '../widget/Dialog';

/**
 * Calls `sendFeedback` to send feedback, handles UI behavior of dialog.
 */
export async function handleFeedbackSubmit(
  dialog: DialogComponent | null,
  feedback: FeedbackFormData,
  options?: SendFeedbackOptions,
): Promise<TransportMakeRequestResponse | void> {
  if (!dialog) {
    // Not sure when this would happen
    return;
  }

  const showFetchError = (): void => {
    if (!dialog) {
      return;
    }
    dialog.showError('There was a problem submitting feedback, please wait and try again.');
  };

  dialog.hideError();

  try {
    const resp = await sendFeedback(feedback, options);

    // Success!
    return resp;
  } catch (err) {
    logger.error(err);
    showFetchError();
  }
}
