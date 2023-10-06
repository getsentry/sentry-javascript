import {sendFeedback} from '../sendFeedback';
import type { FeedbackConfigurationWithDefaults } from '../types';
import { createElement as h } from './util/createElement';

interface Props {
  defaultName: string;
  defaultEmail: string,
  options: FeedbackConfigurationWithDefaults,
}

function retrieveStringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

/**
 * Creates the form element
 */
export function Form({defaultName, defaultEmail, options}: Props) {
  const {$el: $submit, setDisabled: setSubmitDisabled, setEnabled: setSubmitEnabled} = SubmitButton({
    label: options.submitButtonLabel,
  });


  async function handleSubmit(e: Event) {
    e.preventDefault();
    console.log('form submitted');
    if (!(e.target instanceof HTMLFormElement)) {
      return;
    }

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const feedback = {
        name: retrieveStringValue(formData, 'name'),
        email: retrieveStringValue(formData, 'email'),
        message: retrieveStringValue(formData, 'message'),
      };

      try {
        setSubmitDisabled();
        const resp = await sendFeedback(feedback);

        console.log({resp})
        if (!resp) {
          setSubmitEnabled();
        }
      } catch(err) {
        setSubmitEnabled();
      }
    } catch(err) {
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
    })

  const $email = h('input', {
      id: 'email',
      type: 'text', // TODO can be hidden
      ariaHidden: 'false',
      name: 'email',
      className: 'form__input',
      placeholder: options.emailPlaceholder,
      value: defaultEmail,
    })

  const $message = h('textarea', {
      id: 'message',
      autoFocus: 'true',
      rows: '5',
      name: 'message',
      className: 'form__input form__input--textarea',
      placeholder: options.messagePlaceholder,
      onKeyup: (e) => {
        if (!(e.currentTarget instanceof HTMLTextAreaElement)) {
          return;
        }

        if (e.currentTarget.value) {
          setSubmitEnabled();
        } else {
          setSubmitDisabled();
        }
      }
    })

  // h('button', {
  //   type: 'submit',
  //   className: 'btn btn--primary',
  //   disabled: true,
  //   ariaDisabled: 'disabled',
  // }, options.submitButtonLabel)
  //
  const $cancel = h('button', {
    type: 'button',
    className: 'btn btn--default',
  }, options.cancelButtonLabel)

  const $form = h('form', {
    className: 'form',
    onSubmit: handleSubmit,
  }, [

    h('label', {
      htmlFor: 'name',
      className: 'form__label',
    }, [
      options.nameLabel,
      $name
    ]),

    h('label', {
      htmlFor: 'email',
      className: 'form__label',
    }, [
      options.emailLabel,
      $email
    ]),


    h('label', {
      htmlFor: 'message',
      className: 'form__label',
    }, [
      options.messageLabel,
      $message
    ]),

    h('div', {
      className: 'btn-group',
    }, [
      $submit,
      $cancel,
    ])
  ])

  return {
    $form,
  }
}

interface SubmitButtonProps {
  label: string;
}

function SubmitButton({label}: SubmitButtonProps) {
  const $el = h('button', {
    type: 'submit',
    className: 'btn btn--primary',
    disabled: true,
    ariaDisabled: 'disabled',
  }, label)

  return {
    $el,
    setDisabled: () => {
      $el.disabled = true;
      $el.ariaDisabled= 'disabled';
    },
    setEnabled: () => {
      $el.disabled = false;
      $el.ariaDisabled = 'false';
      $el.removeAttribute('ariaDisabled');
    }
  }
}
