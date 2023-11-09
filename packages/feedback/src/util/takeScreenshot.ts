import { WINDOW } from '@sentry/browser';

/**
 * Takes a screenshot
 */
export async function takeScreenshot(): Promise<string> {
  const stream = await WINDOW.navigator.mediaDevices.getDisplayMedia({
    video: {
      width: WINDOW.innerWidth * WINDOW.devicePixelRatio,
      height: WINDOW.innerHeight * WINDOW.devicePixelRatio,
    },
    audio: false,
    // @ts-expect-error safari/firefox only
    preferCurrentTab: true,
    surfaceSwitching: 'exclude',
  });
  const videoTrack = stream.getVideoTracks()[0];
  const canvas = WINDOW.document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  const video = WINDOW.document.createElement('video');
  video.srcObject = new MediaStream([videoTrack]);

  await new Promise<void>(resolve => {
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      stream.getTracks().forEach(track => track.stop());
      resolve();
    };
    void video.play();
  });

  return canvas.toDataURL();
}
