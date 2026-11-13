import type { FeedbackFormData, FeedbackInternalOptions } from '@sentry/core';
import type { VNode } from 'preact';
import { Fragment, h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SUCCESS_MESSAGE_TIMEOUT } from '../../constants';
import type { Props as HeaderProps } from './DialogHeader';
import { DialogHeader } from './DialogHeader';
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
  const titleId = useId();

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
        dialog.querySelector<HTMLElement>('[autofocus]')?.focus();
      }
    }
    return () => {
      if (typeof dialog?.close === 'function') {
        dialog.close();
      } else {
        dialog?.removeAttribute('open');
      }
    };
  }, [open, timeoutId]);

  useLayoutEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

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
          class="dialog"
          ref={dialogRef}
          role="dialog"
          aria-labelledby={titleId}
          onClick={props.onFormClose}
          onCancel={event => {
            event.preventDefault();
            props.onFormClose();
          }}
          onKeyDown={event => {
            if (event.key === 'Escape' && typeof event.currentTarget.showModal !== 'function') {
              event.preventDefault();
              props.onFormClose();
              return;
            }
            if (event.key !== 'Tab') {
              return;
            }
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, [tabindex]'),
            ).filter(
              control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0,
            );
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && event.target === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && event.target === last) {
              event.preventDefault();
              first?.focus();
            }
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
              <DialogHeader options={options} titleId={titleId} />
              <Form {...props} onSubmitSuccess={onSubmitSuccess} />
            </div>
          </div>
        </dialog>
      )}
    </Fragment>
  );
}
