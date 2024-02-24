// biome-ignore lint/nursery/noUnusedImports: reason
import { Fragment, h, render } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { VNode } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { DOCUMENT, SUCCESS_MESSAGE_TIMEOUT } from '../../constants';
import type { FeedbackFormData } from '../../types';
import { createDialogStyles } from './Dialog.css';
import { DialogContent } from './DialogContent';
import { DialogHeader } from './DialogHeader';
import type { Props as HeaderProps } from './DialogHeader';
import type { Props as FormProps } from './Form';
import { Form } from './Form';
import { SuccessIcon } from './SuccessIcon';

export interface Props extends HeaderProps, FormProps {
  successMessageText: string;
  onFormSubmitted: () => void;
}

export interface DialogComponent {
  /**
   * The dialog element itself
   */
  el: HTMLElement;

  /**
   * The style element for this component
   */
  style: HTMLStyleElement;

  /**
   * Open/Show the dialog & form inside it
   */
  open: () => void;

  /**
   * Close/Hide the dialog & form inside it
   */
  close: () => void;
}

/**
 *
 */
export function Dialog(props: Props): DialogComponent {
  const el = DOCUMENT.createElement('div');

  const renderContent = (open: boolean): void => {
    render(<DialogContainer {...props} open={open} />, el);
  };

  renderContent(false);
  const style = createDialogStyles();

  return {
    get el() {
      return el;
    },
    get style() {
      return style;
    },
    open() {
      renderContent(true);
    },
    close() {
      renderContent(false);
    },
  };
}

function DialogContainer({ open, onFormSubmitted, ...props }: Props & { open: boolean }): VNode {
  const successIconHtml = useMemo(() => {
    const logo = SuccessIcon();
    return { __html: logo.outerHTML };
  }, []);

  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handlOnSuccessClick = useCallback(() => {
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
        <div class="success-message" onClick={handlOnSuccessClick}>
          {props.successMessageText}
          <span class="success-icon" dangerouslySetInnerHTML={successIconHtml} />
        </div>
      ) : (
        <dialog class="dialog" onClick={props.onFormClose} open={open}>
          <DialogContent {...props}>
            <DialogHeader {...props} />
            <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
              <Form {...props} onSubmitSuccess={onSubmitSuccess} />
            </div>
          </DialogContent>
        </dialog>
      )}
    </Fragment>
  );
}
