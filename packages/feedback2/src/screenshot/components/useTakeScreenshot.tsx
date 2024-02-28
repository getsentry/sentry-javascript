// biome-ignore lint/nursery/noUnusedImports: reason
import { h } from 'preact'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useEffect } from 'preact/hooks';
import { DOCUMENT, NAVIGATOR, WINDOW } from '../../constants';

interface Props {
  onBeforeScreenshot: () => void;
  onScreenshot: (imageSource: HTMLVideoElement) => void;
  onAfterScreenshot: () => void;
}

export const useTakeScreenshot = ({ onBeforeScreenshot, onScreenshot, onAfterScreenshot }: Props): void => {
  useEffect(() => {
    const takeScreenshot = async (): Promise<void> => {
      onBeforeScreenshot();
      const stream = await NAVIGATOR.mediaDevices.getDisplayMedia({
        video: {
          width: WINDOW.innerWidth * WINDOW.devicePixelRatio,
          height: WINDOW.innerHeight * WINDOW.devicePixelRatio,
        },
        audio: false,
        preferCurrentTab: true,
        surfaceSwitching: 'exclude',
      } as any);

      await new Promise<void>((resolve, reject) => {
        const video = DOCUMENT.createElement('video');
        const videoTrack = stream.getVideoTracks()[0];
        video.srcObject = new MediaStream([videoTrack]);
        video.onloadedmetadata = () => {
          onScreenshot(video);
          stream.getTracks().forEach(track => track.stop());
          resolve();
        };
        video.play().catch(reject);
      });
      onAfterScreenshot();
    };

    takeScreenshot().catch(_error => {
      // TODO
    });
  }, []);
};
