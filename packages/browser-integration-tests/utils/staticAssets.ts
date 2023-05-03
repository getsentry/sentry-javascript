import fs from 'fs';
import path from 'path';

export const STATIC_DIR = path.join(__dirname, '../tmp/static');

export default function setupStaticAssets(): void {
  if (fs.existsSync(STATIC_DIR)) {
    fs.rmSync(STATIC_DIR, { recursive: true });
  }

  fs.mkdirSync(STATIC_DIR, { recursive: true });
}

export function addStaticAsset(localOutPath: string, fileName: string, cb: () => string): void {
  const newPath = path.join(STATIC_DIR, fileName);

  // Only copy files once
  if (!fs.existsSync(newPath)) {
    fs.writeFileSync(newPath, cb(), 'utf-8');
  }

  symlinkAsset(newPath, path.join(localOutPath, fileName));
}

export function addStaticAssetSymlink(localOutPath: string, originalPath: string, fileName: string): void {
  const newPath = path.join(STATIC_DIR, fileName);

  // Only copy files once
  if (!fs.existsSync(newPath)) {
    fs.symlinkSync(originalPath, newPath);
  }

  symlinkAsset(newPath, path.join(localOutPath, fileName));
}

function symlinkAsset(originalPath: string, targetPath: string): void {
  try {
    fs.unlinkSync(targetPath);
  } catch {
    // ignore errors here
  }

  try {
    fs.linkSync(originalPath, targetPath);
  } catch (error) {
    // only ignore these kind of errors
    if (!`${error}`.includes('file already exists')) {
      throw error;
    }
  }
}
