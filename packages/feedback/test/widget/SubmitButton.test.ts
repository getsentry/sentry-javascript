import { SUBMIT_BUTTON_LABEL } from '../../src/constants';
import type { SubmitButtonProps } from '../../src/widget/SubmitButton';
import { SubmitButton } from '../../src/widget/SubmitButton';

function renderSubmitButton(props?: Partial<SubmitButtonProps>) {
  return SubmitButton({
    label: SUBMIT_BUTTON_LABEL,
    ...props,
  });
}

describe('SubmitButton', () => {
  it('renders the submit button, disabled by default', () => {
    const submitButtonComponent = renderSubmitButton();

    expect(submitButtonComponent.el).toBeInstanceOf(HTMLButtonElement);
    if (!submitButtonComponent.el) {
      throw new Error('Element does not exist');
    }
    expect(submitButtonComponent.el.textContent).toBe(SUBMIT_BUTTON_LABEL);
  });
});
