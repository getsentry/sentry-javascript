import { logger } from '@sentry/utils';
// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { JSX, VNode } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { FEEDBACK_WIDGET_SOURCE } from '../../constants';
import type { ScreenshotWidget } from '../../screenshot/integration';
import type { FeedbackFormData, FeedbackInternalOptions, SendFeedbackOptions, SendFeedbackParams } from '../../types';
import { DEBUG_BUILD } from '../../util/debug-build';
import { getMissingFields } from '../../util/validate';

export interface Props
  extends Pick<
    FeedbackInternalOptions,
    | 'cancelButtonLabel'
    | 'emailLabel'
    | 'emailPlaceholder'
    | 'isEmailRequired'
    | 'isNameRequired'
    | 'messageLabel'
    | 'messagePlaceholder'
    | 'nameLabel'
    | 'namePlaceholder'
    | 'showEmail'
    | 'showName'
    | 'submitButtonLabel'
  > {
  defaultEmail: string;
  defaultName: string;
  onFormClose: () => void;
  onSubmit: (data: SendFeedbackParams, options?: SendFeedbackOptions) => void;
  onSubmitSuccess: (data: FeedbackFormData) => void;
  onSubmitError: (error: Error) => void;
  screenshotWidget: ScreenshotWidget | undefined;
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
  screenshotWidget,
}: Props): VNode {
  // TODO: set a ref on the form, and whenever an input changes call proceessForm() and setError()
  const [error, setError] = useState<null | string>(null);

  const [includeScreenshot, setIncludeScreeshot] = useState(false);

  const ScreenshotInput = screenshotWidget && screenshotWidget.input;
  const ScreenshotToggle = screenshotWidget && screenshotWidget.toggle;

  const validateForm = useCallback(
    (form: HTMLFormElement) => {
      const formData = new FormData(form);
      const data: FeedbackFormData = {
        name: retrieveStringValue(formData, 'name'),
        email: retrieveStringValue(formData, 'email'),
        message: retrieveStringValue(formData, 'message'),
        attachment: (formData.get('attachment') as File) || undefined,
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

  const handleFormData = useCallback(
    async (e: JSX.TargetedEvent<HTMLFormElement>) => {
      if (screenshotWidget && includeScreenshot && 'formData' in e && e.formData instanceof FormData) {
        const value = await screenshotWidget.value();
        if (value) {
          e.formData.set('attachment', value, 'screenshot.png');
        }
      }
    },
    [screenshotWidget, includeScreenshot],
  );

  const handleSubmit = useCallback(
    async (e: JSX.TargetedSubmitEvent<HTMLFormElement>) => {
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
    },
    [onSubmitSuccess, onSubmitError],
  );

  return (
    <form class="form" onSubmit={handleSubmit} onFormData={handleFormData}>
      {error ? <div class="form__error-container">{error}</div> : null}

      {ScreenshotInput && includeScreenshot ? <ScreenshotInput initialImage={undefined} /> : null}

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

      {ScreenshotToggle ? (
        <ScreenshotToggle
          onClick={() => {
            setIncludeScreeshot(prev => !prev);
          }}
          isScreenshotIncluded={includeScreenshot}
        />
      ) : null}

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
