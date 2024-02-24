import type { ComponentType, VNode, h as hType } from 'preact';

export interface Props {
  isScreenshotIncluded: boolean;
  onClick: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeToggle(h: typeof hType): ComponentType<Props> {
  return function ScreenshotToggle({ isScreenshotIncluded, onClick }: Props): VNode {
    return (
      <label for="screenshot" class="form__label from int">
        <span class="form__label__text">Screenshot</span>
        <button class="btn btn--default" type="button" onClick={onClick}>
          {isScreenshotIncluded ? 'Remove' : 'Add'}
        </button>
      </label>
    );
  };
}
