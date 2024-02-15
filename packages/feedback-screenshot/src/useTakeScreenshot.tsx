import { useCallback, useState } from 'preact/hooks';
import { h } from 'preact';

const takeScreenshot = async (): Promise<string> => {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: window.innerWidth * window.devicePixelRatio,
      height: window.innerHeight * window.devicePixelRatio,
    },
    audio: false,
    preferCurrentTab: true,
    surfaceSwitching: 'exclude',
  } as any);
  const videoTrack = stream.getVideoTracks()[0];
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  const video = document.createElement('video');
  video.srcObject = new MediaStream([videoTrack]);

  await new Promise<void>(resolve => {
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      stream.getTracks().forEach(track => track.stop());
      resolve();
    };
    video.play();
  });

  return canvas.toDataURL();
};

export const useTakeScreenshot = () => {
  const [isInProgress, setIsInProgress] = useState(false);

  const takeScreenshotCallback = useCallback(async (): Promise<string> => {
    setIsInProgress(true);
    let image: string | null = null;
    try {
      image = await takeScreenshot();
    } catch (error) {
      setIsInProgress(false);
      throw error;
    }
    setIsInProgress(false);
    return image;
  }, []);

  return { isInProgress, takeScreenshot: takeScreenshotCallback };
};
