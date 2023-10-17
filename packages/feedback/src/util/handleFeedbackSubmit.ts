import { sendFeedback } from '../sendFeedback';
import type { FeedbackFormData } from '../types';
import type { DialogComponent } from '../widget/Dialog';

/**
 *
 */
export async function handleFeedbackSubmit(
  dialog: DialogComponent | null,
  feedback: FeedbackFormData,
): Promise<Response | false> {
  if (!dialog) {
    // Not sure when this would happen
    return false;
  }

  const showFetchError = (): void => {
    if (!dialog) {
      return;
    }
    dialog.setSubmitEnabled();
    dialog.showError('There was a problem submitting feedback, please wait and try again.');
  };

  try {
    dialog.hideError();
    dialog.setSubmitDisabled();
    const resp = await sendFeedback(feedback);

    if (!resp) {
      // Errored... re-enable submit button
      showFetchError();
      return false;
    }

    // Success!
    return resp;
  } catch {
    // Errored... re-enable submit button
    showFetchError();
    return false;
  }
}
