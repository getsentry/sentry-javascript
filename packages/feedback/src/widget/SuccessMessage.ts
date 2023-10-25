import type { FeedbackComponent } from '../types';
import { SuccessIcon } from './SuccessIcon';
import { createElement } from './util/createElement';

interface SuccessMessageProps {
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

  const el = createElement(
    'div',
    {
      className: 'success-message',
      onClick: remove,
    },
    SuccessIcon().el,
    message,
  );

  return {
    el,
    remove,
  };
}
