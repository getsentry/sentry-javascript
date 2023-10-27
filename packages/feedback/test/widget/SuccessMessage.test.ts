import { SUCCESS_MESSAGE_TEXT } from '../../src/constants';
import type { SuccessMessageProps } from '../../src/widget/SuccessMessage';
import { SuccessMessage } from '../../src/widget/SuccessMessage';

function renderSuccessMessage(props?: Partial<SuccessMessageProps>) {
  return SuccessMessage({
    message: SUCCESS_MESSAGE_TEXT,
    ...props,
  });
}

describe('SuccessMessage', () => {
  it('renders the submit button, disabled by default', () => {
    const successMessageComponent = renderSuccessMessage();

    expect(successMessageComponent.el).toBeInstanceOf(HTMLDivElement);
    expect(successMessageComponent.el.textContent).toBe(SUCCESS_MESSAGE_TEXT);
  });

  it('removes element and calls `onRemove` callback when clicked', () => {
    const onRemove = jest.fn();
    const successMessageComponent = renderSuccessMessage({
      onRemove
    });

    document.body.appendChild(successMessageComponent.el);
    expect(document.querySelector('.success-message')).not.toBeNull();
    successMessageComponent.el.dispatchEvent(new Event('click'));
    expect(document.querySelector('.success-message')).toBeNull();
    expect(onRemove).toHaveBeenCalledWith();
  });
});
