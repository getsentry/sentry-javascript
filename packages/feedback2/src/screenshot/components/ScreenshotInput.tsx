import type { ComponentType, VNode, h as hType } from 'preact';

export interface Props {
  initialImage: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function makeInput(h: typeof hType, canvasEl: HTMLCanvasElement): ComponentType<Props> {
  return function ScreenshotToggle({ initialImage }: Props): VNode {
    console.log({ initialImage, canvasEl }); // eslint-disable-line no-console

    return (
      <div style={{ background: 'red', width: '100px', height: '100px' }}>
        <input type="text" />
      </div>
    );
  };
}
