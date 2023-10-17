import type { FeedbackFormData } from '../types';
import { DialogComponent } from '../widget/Dialog';
import { sendFeedback } from '../sendFeedback';

export async function handleFeedbackSubmit(dialog: DialogComponent|null, feedback: FeedbackFormData): Promise<Response | false> {
    if (!dialog) {
      // Not sure when this would happen
      return false;
    }

    const showFetchError = () => {
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
      console.log({ resp });

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
