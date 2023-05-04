import setupStaticAssets from './utils/staticAssets';

export default function globalSetup(): Promise<void> {
  return setupStaticAssets();
}
