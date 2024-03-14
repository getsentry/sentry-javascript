// biome-ignore lint/nursery/noUnusedImports: reason
import { Fragment, h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useCallback, useMemo, useState } from 'preact/hooks';
import { SUCCESS_MESSAGE_TIMEOUT } from '../../constants';
import type { FeedbackFormData } from '../../types';
import { DialogContent } from './DialogContent';
import { DialogHeader } from './DialogHeader';
import type { Props as HeaderProps } from './DialogHeader';
import type { Props as FormProps } from './Form';
import { Form } from './Form';
import { SuccessIcon } from './SuccessIcon';

interface Props extends HeaderProps, FormProps {
  successMessageText: string;
  onFormSubmitted: () => void;
  open: boolean;
}

// This returns a VNode, but we want to avoid having preact imports as types that are exported
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DialogComponent({ open, onFormSubmitted, successMessageText, ...props }: Props): any {
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
    (data: FeedbackFormData) => {
      props.onSubmitSuccess(data);
      setTimeoutId(() => setTimeout(onFormSubmitted, SUCCESS_MESSAGE_TIMEOUT));
    },
    [onFormSubmitted],
  );

  return (
    <Fragment>
      {timeoutId ? (
        <div class="success-message" onClick={handleOnSuccessClick}>
          {successMessageText}
          <span class="success-icon" dangerouslySetInnerHTML={successIconHtml} />
        </div>
      ) : (
        <dialog class="dialog" onClick={props.onFormClose} open={open}>
          <DialogContent>
            <DialogHeader {...props} />
            <Form {...props} onSubmitSuccess={onSubmitSuccess} />
          </DialogContent>
        </dialog>
      )}
    </Fragment>
  );
}
