import fs from 'fs';
import path from 'path';

export const STATIC_DIR = path.join(__dirname, '../tmp/static');

export default async function setupStaticAssets(): Promise<void> {
  if (fs.existsSync(STATIC_DIR)) {
    await fs.promises.rm(STATIC_DIR, { recursive: true });
  }

  await fs.promises.mkdir(STATIC_DIR, { recursive: true });
}

export function addStaticAsset(localOutPath: string, fileName: string, cb: () => string): void {
  const newPath = path.join(STATIC_DIR, fileName);

  // Only copy files once
  if (!fs.existsSync(newPath)) {
    fs.writeFileSync(newPath, cb(), 'utf-8');
  }

  symlinkAsset(newPath, path.join(localOutPath, fileName));
}

export function symlinkAsset(originalPath: string, targetPath: string): void {
  try {
    fs.linkSync(originalPath, targetPath);
  } catch {
    // ignore errors here, probably means the file already exists
    // Since we always build into a new directory for each test, we can safely ignore this
  }
}
