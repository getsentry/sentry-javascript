import type { FeedbackInternalOptions } from '../types';
import { SuccessMessage } from './components/SuccessMessage';

/**
 * Show the success message for 5 seconds
 */
export function showSuccessMessage(shadow: ShadowRoot, options: FeedbackInternalOptions, onCleanup: () => void): void {
  const cleanup = (): void => {
    success.remove();
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    onCleanup();
  };

  const success = SuccessMessage({
    message: options.successMessageText,
    onClick: cleanup,
  });

  if (!success) {
    throw new Error('Unable to show success message');
  }

  shadow.appendChild(success);

  const timeoutId = setTimeout(cleanup, 5000);
}
