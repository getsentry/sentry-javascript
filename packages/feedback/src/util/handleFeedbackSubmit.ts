import { sendFeedback } from '../sendFeedback';
import type { FeedbackFormData, SendFeedbackOptions } from '../types';
import type { DialogComponent } from '../widget/Dialog';

/**
 * Calls `sendFeedback` to send feedback, handles UI behavior of dialog.
 */
export function handleFeedbackSubmit(
  dialog: DialogComponent | null,
  feedback: FeedbackFormData,
  options?: SendFeedbackOptions,
): string | undefined {
  if (!dialog) {
    // Not sure when this would happen
    return;
  }

  // const showFetchError = (): void => {
  //   if (!dialog) {
  //     return;
  //   }
  //   dialog.showError('There was a problem submitting feedback, please wait and try again.');
  // };

  dialog.hideError();

  // TODO: Error handling?
  return sendFeedback(feedback, options);
  // try {
  //   const resp = await sendFeedback(feedback, options);
  //
  //   // Success!
  //   return resp;
  // } catch {
  //   // Errored... re-enable submit button
  //   showFetchError();
  // }
}
