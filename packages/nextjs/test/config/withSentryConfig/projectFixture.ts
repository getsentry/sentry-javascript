import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const projectDirs: string[] = [];

/** Creates a temporary project directory with empty `files`. `removeProjects` deletes it. */
export function makeProject(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sentry-nextjs-project-'));
  projectDirs.push(dir);
  for (const file of files) {
    const absolute = path.join(dir, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }
  return dir;
}

export function removeProjects(): void {
  for (const dir of projectDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
