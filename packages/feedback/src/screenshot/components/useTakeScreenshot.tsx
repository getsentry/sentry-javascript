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

const FRAMES_BEFORE_CAPTURE = 2;
// Safari drops the user gesture that `getDisplayMedia` needs 1s after the click, so stay well below that.
const MAX_WAIT_BEFORE_CAPTURE_MS = 300;

/** Resolves once `frames` animation frames have been drawn, or after `timeout` ms if the page draws none. */
function waitForFrames(frames: number, timeout: number): Promise<void> {
  return new Promise(resolve => {
    const timeoutId = setTimeout(resolve, timeout);
    let remaining = frames;
    const onFrame = (): void => {
      remaining -= 1;
      if (remaining > 0) {
        WINDOW.requestAnimationFrame(onFrame);
        return;
      }
      clearTimeout(timeoutId);
      resolve();
    };
    WINDOW.requestAnimationFrame(onFrame);
  });
}

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

        // The capture starts from the last frame the browser painted, which can still show the form that
        // `onBeforeScreenshot` just hid. A tab that draws no frames (e.g. a background tab) must not hold it forever.
        await waitForFrames(FRAMES_BEFORE_CAPTURE, MAX_WAIT_BEFORE_CAPTURE_MS);

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
