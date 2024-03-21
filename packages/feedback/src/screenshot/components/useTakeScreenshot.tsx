// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useEffect } from 'preact/hooks';
import { DOCUMENT, NAVIGATOR, WINDOW } from '../../constants';

interface Props {
  onBeforeScreenshot: () => void;
  onScreenshot: (imageSource: HTMLVideoElement) => void;
  onAfterScreenshot: () => void;
  onError: (error: Error) => void;
}

export const useTakeScreenshot = ({ onBeforeScreenshot, onScreenshot, onAfterScreenshot, onError }: Props): void => {
  useEffect(() => {
    const takeScreenshot = async (): Promise<void> => {
      onBeforeScreenshot();
      const stream = await NAVIGATOR.mediaDevices.getDisplayMedia({
        video: {
          width: WINDOW.innerWidth * WINDOW.devicePixelRatio,
          height: WINDOW.innerHeight * WINDOW.devicePixelRatio,
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
          onScreenshot(video);
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
