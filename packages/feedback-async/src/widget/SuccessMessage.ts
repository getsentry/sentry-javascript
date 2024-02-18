import { WINDOW } from '../constants';
import type { FeedbackComponent } from '../types';
import { SuccessIcon } from './components/SuccessIcon';

export interface SuccessMessageProps {
  message: string;
  onRemove?: () => void;
}

interface SuccessMessageComponent extends FeedbackComponent<HTMLDivElement> {
  /**
   * Removes the component
   */
  remove: () => void;
}

/**
 * Feedback dialog component that has the form
 */
export function SuccessMessage({ message, onRemove }: SuccessMessageProps): SuccessMessageComponent {
  function remove(): void {
    if (!el) {
      return;
    }

    el.remove();
    onRemove && onRemove();
  }

  const doc = WINDOW.document;
  const el = doc.createElement('div');
  el.className = 'success-message';
  el.addEventListener('click', remove);
  el.appendChild(SuccessIcon());
  el.appendChild(doc.createTextNode(message));

  return {
    el,
    remove,
  };
}
