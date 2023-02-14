import workerString from './worker';

export function getWorkerURL() {
  const workerBlob = new Blob([workerString]);
  return URL.createObjectURL(workerBlob);
}
