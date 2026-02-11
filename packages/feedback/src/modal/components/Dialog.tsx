import type { FeedbackFormData, FeedbackInternalOptions } from '@sentry/core';
import type { VNode } from 'preact';
import { Fragment, h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useMemo, useState } from 'preact/hooks';
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
        <dialog class="dialog" onClick={options.onFormClose} open={open}>
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
