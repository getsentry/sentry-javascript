import type * as Hooks from 'preact/hooks';
import { DOCUMENT, NAVIGATOR, WINDOW } from '../../constants';

interface FactoryParams {
  hooks: typeof Hooks;
}

interface Props {
  onBeforeScreenshot: () => void;
  onScreenshot: (imageSource: HTMLVideoElement, dpi: number) => void;
  onAfterScreenshot: () => void;
  onError: (error: Error) => void;
}

type UseTakeScreenshot = ({ onBeforeScreenshot, onScreenshot, onAfterScreenshot, onError }: Props) => void;

export function useTakeScreenshotFactory({ hooks }: FactoryParams): UseTakeScreenshot {
  function useDpi(): number {
    const [dpi, setDpi] = hooks.useState<number>(WINDOW.devicePixelRatio ?? 1);
    hooks.useEffect(() => {
      const onChange = (): void => {
        setDpi(WINDOW.devicePixelRatio);
      };
      const media = matchMedia(`(resolution: ${WINDOW.devicePixelRatio}dppx)`);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    }, []);

    return dpi;
  }

  return function useTakeScreenshot({ onBeforeScreenshot, onScreenshot, onAfterScreenshot, onError }: Props) {
    const dpi = useDpi();

    hooks.useEffect(() => {
      const takeScreenshot = async (): Promise<void> => {
        onBeforeScreenshot();

        // Chrome will animate a top-bar which can shrink the window height by a
        // few pixels. The exact amount depends on how fast it takes to exec
        // the onloadedmetadata callback.
        // https://stackoverflow.com/q/75833049
        const stream = await NAVIGATOR.mediaDevices.getDisplayMedia({
          video: {
            width: WINDOW.innerWidth * dpi,
            height: WINDOW.innerHeight * dpi,
          },
          audio: false,
          // @ts-expect-error experimental flags: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#prefercurrenttab
          monitorTypeSurfaces: 'exclude',
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          surfaceSwitching: 'exclude',
        });

        const video = DOCUMENT.createElement('video');
        await new Promise<void>((resolve, reject) => {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            onScreenshot(video, dpi);
            stream.getTracks().forEach(track => track.stop());
            resolve();
          };
          video.play().catch(reject);
        });
        onAfterScreenshot();
      };

      takeScreenshot().catch(onError);
    }, []);
  };
}
