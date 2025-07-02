import { captureException } from './nested-file';

export function runSentry(): void {
  for (let i = 0; i < 10; i++) {
    captureException(i);
  }
}
