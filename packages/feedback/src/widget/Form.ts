import type { FeedbackComponent, FeedbackFormData, FeedbackInternalOptions, FeedbackTextConfiguration } from '../types';
import { SubmitButton } from './SubmitButton';
import { createElement } from './util/createElement';

export interface FormComponentProps
  extends Pick<
    FeedbackInternalOptions,
    | 'showName'
    | 'showEmail'
    | 'isAnonymous'
    | Exclude<keyof FeedbackTextConfiguration, 'buttonLabel' | 'formTitle' | 'successMessageText'>
  > {
  /**
   * A default name value to render the input with. Empty strings are ok.
   */
  defaultName: string;
  /**
   * A default email value to render the input with. Empty strings are ok.
   */
  defaultEmail: string;
  onCancel?: (e: Event) => void;
  onSubmit?: (feedback: FeedbackFormData) => void;
}

interface FormComponent extends FeedbackComponent<HTMLFormElement> {
  /**
   * Shows the error message
   */
  showError: (message: string) => void;

  /**
   * Hides the error message
   */
  hideError: () => void;
}

function retrieveStringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

/**
 * Creates the form element
 */
export function Form({
  nameLabel,
  namePlaceholder,
  emailLabel,
  emailPlaceholder,
  messageLabel,
  messagePlaceholder,
  cancelButtonLabel,
  submitButtonLabel,

  showName,
  showEmail,
  isAnonymous,

  defaultName,
  defaultEmail,
  onCancel,
  onSubmit,
}: FormComponentProps): FormComponent {
  const {
    el: submitEl,
  } = SubmitButton({
    label: submitButtonLabel,
  });

  function handleSubmit(e: Event): void {
    e.preventDefault();

    if (!(e.target instanceof HTMLFormElement)) {
      return;
    }

    try {
      if (onSubmit) {
        const formData = new FormData(e.target as HTMLFormElement);
        const feedback = {
          name: retrieveStringValue(formData, 'name'),
          email: retrieveStringValue(formData, 'email'),
          message: retrieveStringValue(formData, 'message'),
        };

        onSubmit(feedback);
      }
    } catch {
      // pass
    }
  }

  const errorEl = createElement('div', {
    className: 'form__error-container form__error-container--hidden',
    ['aria-hidden']: 'true',
  });

  function showError(message: string): void {
    errorEl.textContent = message;
    errorEl.classList.remove('form__error-container--hidden');
    errorEl.setAttribute('aria-hidden', 'false');
  }

  function hideError(): void {
    errorEl.textContent = '';
    errorEl.classList.add('form__error-container--hidden');
    errorEl.setAttribute('aria-hidden', 'true');
  }

  const nameEl = createElement('input', {
    id: 'name',
    type: showName ? 'text' : 'hidden',
    ['aria-hidden']: showName ? 'false' : 'true',
    name: 'name',
    className: 'form__input',
    placeholder: namePlaceholder,
    value: defaultName,
  });

  const emailEl = createElement('input', {
    id: 'email',
    type: showEmail ? 'text' : 'hidden',
    ['aria-hidden']: showEmail ? 'false' : 'true',
    name: 'email',
    className: 'form__input',
    placeholder: emailPlaceholder,
    value: defaultEmail,
  });

  const messageEl = createElement('textarea', {
    id: 'message',
    autoFocus: 'true',
    rows: '5',
    name: 'message',
    required: true,
    className: 'form__input form__input--textarea',
    placeholder: messagePlaceholder,
  });

  const cancelEl = createElement(
    'button',
    {
      type: 'button',
      className: 'btn btn--default',
      ['aria-label']: cancelButtonLabel,
      onClick: (e: Event) => {
        onCancel && onCancel(e);
      },
    },
    cancelButtonLabel,
  );

  const formEl = createElement(
    'form',
    {
      className: 'form',
      onSubmit: handleSubmit,
    },
    [
      errorEl,

      !isAnonymous &&
        showName &&
        createElement(
          'label',
          {
            htmlFor: 'name',
            className: 'form__label',
          },
          [nameLabel, nameEl],
        ),
      !isAnonymous && !showName && nameEl,

      !isAnonymous &&
        showEmail &&
        createElement(
          'label',
          {
            htmlFor: 'email',
            className: 'form__label',
          },
          [emailLabel, emailEl],
        ),
      !isAnonymous && !showEmail && emailEl,

      createElement(
        'label',
        {
          htmlFor: 'message',
          className: 'form__label',
        },
        [createElement('span', {className: 'form__label__text'}, messageLabel,
        createElement('span', {className: 'form__label__text--required'}, ' (required)')), messageEl],
      ),

      createElement(
        'div',
        {
          className: 'btn-group',
        },
        [submitEl, cancelEl],
      ),
    ],
  );

  return {
    get el() { return formEl },
    showError,
    hideError,
  };
}
