import type { FeedbackComponent } from '../types';
import { SuccessIcon } from './SuccessIcon';
import { createElement as h } from './util/createElement';

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
  function remove() {
    if (!$el) {
      return;
    }

    $el.remove();
    onRemove && onRemove();
  }

  const $el = h(
    'div',
    {
      className: 'success-message',
      onClick: remove,
    },
    SuccessIcon().$el,
    message,
  );

  return {
    $el,
    remove,
  };
}
