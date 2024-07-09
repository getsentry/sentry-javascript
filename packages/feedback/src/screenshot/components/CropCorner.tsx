import type { VNode, h as hType } from 'preact';

interface FactoryParams {
  h: typeof hType;
}

export default function CropCornerFactory({
  h, // eslint-disable-line @typescript-eslint/no-unused-vars
}: FactoryParams) {
  return function CropCorner({
    top,
    left,
    corner,
    onGrabButton,
  }: {
    top: number;
    left: number;
    corner: string;
    onGrabButton: (e: Event, corner: string) => void;
  }): VNode {
    return (
      <button
        class={`editor__crop-corner editor__crop-corner--${corner} `}
        style={{
          top: top,
          left: left,
        }}
        onMouseDown={e => {
          e.preventDefault();
          onGrabButton(e, corner);
        }}
        onClick={e => {
          e.preventDefault();
        }}
      ></button>
    );
  };
}
