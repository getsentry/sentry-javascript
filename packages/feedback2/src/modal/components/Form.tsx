import { logger } from '@sentry/utils';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { FEEDBACK_WIDGET_SOURCE } from '../../constants';
import type { FeedbackFormData, SendFeedbackOptions, SendFeedbackParams } from '../../types';
import { DEBUG_BUILD } from '../../util/debug-build';
import { getMissingFields } from '../../util/validate';

export interface Props {
  cancelButtonLabel: string;
  defaultEmail: string;
  defaultName: string;
  emailLabel: string;
  emailPlaceholder: string;
  isEmailRequired: boolean;
  isNameRequired: boolean;
  messageLabel: string;
  messagePlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  onFormClose: () => void;
  onSubmit: (data: SendFeedbackParams, options?: SendFeedbackOptions) => void;
  onSubmitSuccess: (feedback: FeedbackFormData) => void;
  onSubmitError: (error: Error) => void;
  showEmail: boolean;
  showName: boolean;
  submitButtonLabel: string;
}

function retrieveStringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

export function Form({
  cancelButtonLabel,
  defaultEmail,
  defaultName,
  emailLabel,
  emailPlaceholder,
  isEmailRequired,
  isNameRequired,
  messageLabel,
  messagePlaceholder,
  nameLabel,
  namePlaceholder,
  onFormClose,
  onSubmit,
  onSubmitSuccess,
  onSubmitError,
  showEmail,
  showName,
  submitButtonLabel,
}: Props): VNode {
  // TODO: set a ref on the form, and whenever an input changes call proceessForm() and setError()
  const [error, setError] = useState<null | string>(null);

  const validateForm = useCallback(
    (form: HTMLFormElement) => {
      const formData = new FormData(form);
      const data: FeedbackFormData = {
        name: retrieveStringValue(formData, 'name'),
        email: retrieveStringValue(formData, 'email'),
        message: retrieveStringValue(formData, 'message'),
      };
      const missingFields = getMissingFields(data, {
        emailLabel,
        isEmailRequired,
        isNameRequired,
        messageLabel,
        nameLabel,
      });

      if (missingFields.length > 0) {
        setError(`Please enter in the following required fields: ${missingFields.join(', ')}`);
      } else {
        setError(null);
      }

      return { data, missingFields };
    },
    [emailLabel, isEmailRequired, isNameRequired, messageLabel, nameLabel],
  );

  return (
    <form
      class="form"
      onSubmit={async e => {
        try {
          e.preventDefault();
          if (!(e.target instanceof HTMLFormElement)) {
            return;
          }
          const { data, missingFields } = validateForm(e.target);
          if (missingFields.length > 0) {
            return;
          }
          try {
            await onSubmit({ ...data, source: FEEDBACK_WIDGET_SOURCE });
            onSubmitSuccess(data);
          } catch (error) {
            DEBUG_BUILD && logger.error(error);
            setError('There was a problem submitting feedback, please wait and try again.');
            onSubmitError(error as Error);
          }
        } catch {
          // pass
        }
      }}
    >
      {error ? <div class="form__error-container">{error}</div> : null}

      {showName ? (
        <label for="name" class="form__label">
          <LabelText label={nameLabel} isRequired={isNameRequired} />
          <input
            class="form__input"
            defaultValue={defaultName}
            id="name"
            name="name"
            placeholder={namePlaceholder}
            required={isNameRequired}
            type="text"
          />
        </label>
      ) : (
        <input aria-hidden value={defaultName} name="name" type="hidden" />
      )}

      {showEmail ? (
        <label for="email" class="form__label">
          <LabelText label={emailLabel} isRequired={isEmailRequired} />
          <input
            class="form__input"
            defaultValue={defaultEmail}
            id="email"
            name="email"
            placeholder={emailPlaceholder}
            required={isEmailRequired}
            type="text"
          ></input>
        </label>
      ) : (
        <input aria-hidden value={defaultEmail} name="email" type="hidden" />
      )}

      <label for="message" class="form__label">
        <LabelText label={messageLabel} isRequired />
        <textarea
          autoFocus
          class="form__input form__input--textarea"
          id="message"
          name="message"
          placeholder={messagePlaceholder}
          required={true}
          rows={5}
        />
      </label>

      <div class="btn-group">
        <button class="btn btn--primary" type="submit">
          {submitButtonLabel}
        </button>
        <button class="btn btn--default" type="button" onClick={onFormClose}>
          {cancelButtonLabel}
        </button>
      </div>
    </form>
  );
}

function LabelText({ label, isRequired }: { label: string; isRequired: boolean }): VNode {
  return (
    <span class="form__label__text">
      {label}
      {isRequired && <span class="form__label__text--required">(required)</span>}
    </span>
  );
}
