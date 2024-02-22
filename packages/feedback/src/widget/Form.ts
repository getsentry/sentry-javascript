import type { Attachment } from '@sentry/types';
import type { FeedbackComponent, FeedbackFormData, FeedbackInternalOptions, FeedbackTextConfiguration } from '../types';
import { SubmitButton } from './SubmitButton';
import { createElement } from './util/createElement';
import * as ScreenshotIntegration from '@sentry-internal/feedback-screenshot';

export interface FormComponentProps
  extends Pick<
    FeedbackInternalOptions,
    | 'showName'
    | 'showEmail'
    | 'isNameRequired'
    | 'isEmailRequired'
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
  onSubmit?: (feedback: FeedbackFormData, screenshots?: Attachment[]) => void;
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

async function canvasToUint8Array(image: HTMLCanvasElement): Promise<Uint8Array | null> {
  const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> => {
    return new Promise(resolve => {
      canvas.toBlob(blob => {
        resolve(blob);
      });
    });
  };
  const blob = await canvasToBlob(image);
  if (blob) {
    const blobData = await blob.arrayBuffer();
    return new Uint8Array(blobData);
  }
  return null;
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
  isNameRequired,
  isEmailRequired,

  defaultName,
  defaultEmail,
  onCancel,
  onSubmit,
}: FormComponentProps): FormComponent {
  let screenshotImage: HTMLCanvasElement | null = null;
  function setScreenshotImage(newScreenshot: HTMLCanvasElement | null): void {
    screenshotImage = newScreenshot;
  }
  const { el: submitEl } = SubmitButton({
    label: submitButtonLabel,
  });

  async function handleSubmit(e: Event): Promise<void> {
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

        if (screenshotImage) {
          const screenshotBlob = await canvasToUint8Array(screenshotImage);
          if (screenshotBlob) {
            onSubmit(feedback, [
              { filename: 'screenshot.png', data: screenshotBlob, contentType: 'application/octet-stream' },
            ]);
          }
        } else {
          onSubmit(feedback);
        }
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
    required: isNameRequired,
    className: 'form__input',
    placeholder: namePlaceholder,
    value: defaultName,
  });

  const emailEl = createElement('input', {
    id: 'email',
    type: showEmail ? 'text' : 'hidden',
    ['aria-hidden']: showEmail ? 'false' : 'true',
    name: 'email',
    required: isEmailRequired,
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

  const screenshot = createElement('div', { className: 'screenshot' });

  const screenshotButton = createElement('div', { className: 'btn-group' });

  // @ts-expect-error temp
  ScreenshotIntegration.feedbackScreenshotIntegration().renderScreenshotWidget({
    croppingRef: screenshot,
    buttonRef: screenshotButton,
    props: { screenshotImage, setScreenshotImage },
  });

  const formEl = createElement(
    'form',
    {
      className: 'form',
      onSubmit: handleSubmit,
    },
    [
      errorEl,
      screenshot,

      createElement(
        'div',
        {
          className: 'info',
        },
        [
          showName &&
            createElement(
              'label',
              {
                htmlFor: 'name',
                className: 'form__label',
              },
              [
                createElement(
                  'span',
                  { className: 'form__label__text' },
                  nameLabel,
                  isNameRequired && createElement('span', { className: 'form__label__text--required' }, ' (required)'),
                ),
                nameEl,
              ],
            ),
          !showName && nameEl,

          showEmail &&
            createElement(
              'label',
              {
                htmlFor: 'email',
                className: 'form__label',
              },
              [
                createElement(
                  'span',
                  { className: 'form__label__text' },
                  emailLabel,
                  isEmailRequired && createElement('span', { className: 'form__label__text--required' }, ' (required)'),
                ),
                emailEl,
              ],
            ),
          !showEmail && emailEl,

          createElement(
            'label',
            {
              htmlFor: 'message',
              className: 'form__label',
            },
            [
              createElement(
                'span',
                { className: 'form__label__text' },
                messageLabel,
                createElement('span', { className: 'form__label__text--required' }, ' (required)'),
              ),
              messageEl,
            ],
          ),

          screenshotButton,

          createElement(
            'div',
            {
              className: 'btn-group',
            },
            [submitEl, cancelEl],
          ),
        ],
      ),
    ],
  );

  return {
    get el() {
      return formEl;
    },
    showError,
    hideError,
  };
}
