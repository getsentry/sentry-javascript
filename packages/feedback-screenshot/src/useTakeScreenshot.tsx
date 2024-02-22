import { useCallback, useState } from 'preact/hooks';
import { h } from 'preact';

const takeScreenshot = async (): Promise<HTMLCanvasElement> => {
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

  return canvas;
};

export const useTakeScreenshot = () => {
  const [isInProgress, setIsInProgress] = useState(false);

  const takeScreenshotCallback = useCallback(async (): Promise<HTMLCanvasElement> => {
    setIsInProgress(true);
    let image: HTMLCanvasElement | null = null;
    const style = document.createElement('style');
    style.innerHTML = '.dialog { display: none; }';
    document.getElementById('sentry-feedback')?.shadowRoot?.appendChild(style);
    try {
      image = await takeScreenshot();
      document.getElementById('sentry-feedback')?.shadowRoot?.removeChild(style);
    } catch (error) {
      setIsInProgress(false);
      document.getElementById('sentry-feedback')?.shadowRoot?.removeChild(style);
      throw error;
    }
    setIsInProgress(false);
    return image;
  }, []);

  return { isInProgress, takeScreenshot: takeScreenshotCallback };
};
