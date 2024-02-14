import type { FeedbackComponent } from '../types';
import { createElement } from './util/createElement';

export interface SubmitButtonProps {
  label: string;
}

type SubmitButtonComponent = FeedbackComponent<HTMLButtonElement>;

/**
 *
 */
export function SubmitButton({ label }: SubmitButtonProps): SubmitButtonComponent {
  const el = createElement(
    'button',
    {
      type: 'submit',
      className: 'btn btn--primary',
      ['aria-label']: label,
    },
    label,
  );

  return {
    el,
  };
}
