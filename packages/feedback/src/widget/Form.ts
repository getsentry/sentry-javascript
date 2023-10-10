import type { FeedbackConfigurationWithDefaults, FeedbackFormData } from '../types';
import { createElement as h } from './util/createElement';

interface Props {
  defaultName: string;
  defaultEmail: string;
  options: FeedbackConfigurationWithDefaults;
  onCancel?: (e: Event) => void;
  onSubmit?: (feedback: FeedbackFormData) => void;
}

interface FormReturn {
  $el: HTMLFormElement;
  setSubmitDisabled: () => void;
  setSubmitEnabled: () => void;
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
export function Form({ defaultName, defaultEmail, onCancel, onSubmit, options }: Props): FormReturn {
  const {
    $el: $submit,
    setDisabled: setSubmitDisabled,
    setEnabled: setSubmitEnabled,
  } = SubmitButton({
    label: options.submitButtonLabel,
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    console.log('form submitted');
    if (!(e.target instanceof HTMLFormElement)) {
      return;
    }

    try {
      if (typeof onSubmit === 'function') {
        const formData = new FormData(e.target as HTMLFormElement);
        const feedback = {
          name: retrieveStringValue(formData, 'name'),
          email: retrieveStringValue(formData, 'email'),
          message: retrieveStringValue(formData, 'message'),
        };

        onSubmit(feedback);
      }

      // try {
      //   setSubmitDisabled();
      //   const resp = await sendFeedback(feedback);
      //
      //   console.log({resp})
      //
      //   if (!resp) {
      //     // Errored
      //     setSubmitEnabled();
      //     return;
      //   }
      //   // Success
      // } catch(err) {
      //   setSubmitEnabled();
      // }
    } catch {
      // pass
    }
  }

  const $name = h('input', {
    id: 'name',
    type: 'text', // TODO can be hidden
    ariaHidden: 'false',
    name: 'name',
    className: 'form__input',
    placeholder: options.namePlaceholder,
    value: defaultName,
  });

  const $email = h('input', {
    id: 'email',
    type: 'text', // TODO can be hidden
    ariaHidden: 'false',
    name: 'email',
    className: 'form__input',
    placeholder: options.emailPlaceholder,
    value: defaultEmail,
  });

  const $message = h('textarea', {
    id: 'message',
    autoFocus: 'true',
    rows: '5',
    name: 'message',
    className: 'form__input form__input--textarea',
    placeholder: options.messagePlaceholder,
    onKeyup: e => {
      if (!(e.currentTarget instanceof HTMLTextAreaElement)) {
        return;
      }

      if (e.currentTarget.value) {
        setSubmitEnabled();
      } else {
        setSubmitDisabled();
      }
    },
  });

  // h('button', {
  //   type: 'submit',
  //   className: 'btn btn--primary',
  //   disabled: true,
  //   ariaDisabled: 'disabled',
  // }, options.submitButtonLabel)
  //
  const $cancel = h(
    'button',
    {
      type: 'button',
      className: 'btn btn--default',
      onClick: e => {
        if (typeof onCancel === 'function') {
          onCancel(e);
        }
      },
    },
    options.cancelButtonLabel,
  );

  const $form = h(
    'form',
    {
      className: 'form',
      onSubmit: handleSubmit,
    },
    [
      h(
        'label',
        {
          htmlFor: 'name',
          className: 'form__label',
        },
        [options.nameLabel, $name],
      ),

      h(
        'label',
        {
          htmlFor: 'email',
          className: 'form__label',
        },
        [options.emailLabel, $email],
      ),

      h(
        'label',
        {
          htmlFor: 'message',
          className: 'form__label',
        },
        [options.messageLabel, $message],
      ),

      h(
        'div',
        {
          className: 'btn-group',
        },
        [$submit, $cancel],
      ),
    ],
  );

  return {
    $el: $form,
    setSubmitDisabled,
    setSubmitEnabled,
  };
}

interface SubmitButtonProps {
  label: string;
}

interface SubmitReturn {
  $el: HTMLButtonElement;

  /**
   * Disables the submit button
   */
  setDisabled: () => void;

  /**
   * Enables the submit button
   */
  setEnabled: () => void;
}

function SubmitButton({ label }: SubmitButtonProps): SubmitReturn {
  const $el = h(
    'button',
    {
      type: 'submit',
      className: 'btn btn--primary',
      disabled: true,
      ariaDisabled: 'disabled',
    },
    label,
  );

  return {
    $el,
    setDisabled: () => {
      $el.disabled = true;
      $el.ariaDisabled = 'disabled';
    },
    setEnabled: () => {
      $el.disabled = false;
      $el.ariaDisabled = 'false';
      $el.removeAttribute('ariaDisabled');
    },
  };
}
