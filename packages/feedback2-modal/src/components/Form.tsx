// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import type { FeedbackFormData } from '../types';

export interface Props {
  cancelButtonLabel: string;
  defaultEmail: string;
  defaultName: string;
  emailLabel: string;
  emailPlaceholder: string;
  errorMessage?: string | undefined;
  isEmailRequired: boolean;
  isNameRequired: boolean;
  messageLabel: string;
  messagePlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  onCancel: (e: Event) => void;
  onSubmit: (feedback: FeedbackFormData) => void;
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
  errorMessage,
  isEmailRequired,
  isNameRequired,
  messageLabel,
  messagePlaceholder,
  nameLabel,
  namePlaceholder,
  onCancel,
  onSubmit,
  showEmail,
  showName,
  submitButtonLabel,
}: Props): VNode {
  return (
    <form
      class="form"
      onSubmit={e => {
        e.preventDefault();
        if (!(e.target instanceof HTMLFormElement)) {
          return;
        }
        try {
          const formData = new FormData(e.target);
          onSubmit({
            name: retrieveStringValue(formData, 'name'),
            email: retrieveStringValue(formData, 'email'),
            message: retrieveStringValue(formData, 'message'),
          });
        } catch {
          // pass
        }
      }}
    >
      {errorMessage ? <div class="form__error-container">{errorMessage}</div> : null}

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
        <button class="btn btn--default" type="button" onClick={onCancel}>
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
