import type { FeedbackComponent, FeedbackTheme } from '../types';
import { SuccessIcon } from './SuccessIcon';
import { createElement as h } from './util/createElement';

interface SuccessMessageProps {
  message: string;
  theme: FeedbackTheme;
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
export function SuccessMessage({ message, theme, onRemove }: SuccessMessageProps): SuccessMessageComponent {
  function remove() {
    if (!$el) {
      return;
    }

    $el.remove();
    if (typeof onRemove === 'function') {
      onRemove();
    }
  }

  const $el = h(
    'div',
    {
      className: 'success-message',
      onClick: remove,
    },
    SuccessIcon({ color: theme.light.success }).$el,
    message,
  );

  return {
    $el,
    remove,
  };
}
