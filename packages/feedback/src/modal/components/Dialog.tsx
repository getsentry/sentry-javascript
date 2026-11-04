import type { FeedbackFormData, FeedbackInternalOptions } from '@sentry/core';
import type { VNode } from 'preact';
import { Fragment, h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SUCCESS_MESSAGE_TIMEOUT } from '../../constants';
import type { Props as HeaderProps } from './DialogHeader';
import { DIALOG_TITLE_ID, DialogHeader } from './DialogHeader';
import type { Props as FormProps } from './Form';
import { Form } from './Form';
import { SuccessIcon } from './SuccessIcon';

interface Props extends HeaderProps, FormProps {
  onFormSubmitted: () => void;
  open: boolean;
  options: FeedbackInternalOptions;
}

export function Dialog({ open, onFormSubmitted, ...props }: Props): VNode {
  const options = props.options;
  const successIconHtml = useMemo(() => ({ __html: SuccessIcon().outerHTML }), []);

  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === open) {
      return;
    }
    if (!open) {
      dialog.close();
    } else if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      // Safari < 15.4 has no `showModal()`
      dialog.open = true;
    }
  }, [open, timeoutId]);

  const handleOnSuccessClick = useCallback(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      setTimeoutId(null);
    }
    onFormSubmitted();
  }, [timeoutId]);

  const onSubmitSuccess = useCallback(
    (data: FeedbackFormData, eventId: string) => {
      props.onSubmitSuccess(data, eventId);
      setTimeoutId(
        setTimeout(() => {
          onFormSubmitted();
          setTimeoutId(null);
        }, SUCCESS_MESSAGE_TIMEOUT),
      );
    },
    [onFormSubmitted],
  );

  return (
    <Fragment>
      {timeoutId ? (
        <div class="success__position" onClick={handleOnSuccessClick}>
          <div class="success__content">
            {options.successMessageText}
            <span class="success__icon" dangerouslySetInnerHTML={successIconHtml} />
          </div>
        </div>
      ) : (
        <dialog
          ref={dialogRef}
          class="dialog"
          aria-labelledby={DIALOG_TITLE_ID}
          onClick={options.onFormClose}
          onCancel={e => {
            // Close through `onFormClose` so the widget state stays in sync with the dialog
            e.preventDefault();
            options.onFormClose?.();
          }}
        >
          <div class="dialog__position">
            <div
              class="dialog__content"
              onClick={e => {
                // Stop event propagation so clicks on content modal do not propagate to dialog (which will close dialog)
                e.stopPropagation();
              }}
            >
              <DialogHeader options={options} />
              <Form {...props} onSubmitSuccess={onSubmitSuccess} />
            </div>
          </div>
        </dialog>
      )}
    </Fragment>
  );
}
