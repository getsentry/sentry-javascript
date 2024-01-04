import assert from 'assert';
import * as fs from 'fs';
import path from 'path';

import type { GitHash } from '../util/git.js';
import { Git } from '../util/git.js';
import { Result } from './result.js';

const delimiter = '-';

export class ResultSetItem {
  public constructor(public path: string) {}

  /**
   *
   */
  public get name(): string {
    return path.basename(this.path);
  }

  /**
   *
   */
  public get number(): number {
    return parseInt(this.parts[0]);
  }

  /**
   *
   */
  public get hash(): GitHash {
    return this.parts[1];
  }

  /**
   *
   */
  public get parts(): string[] {
    return path.basename(this.path).split(delimiter);
  }
}

/// Wraps a directory containing multiple (N-<git-hash>-result.json) files.
/// The files are numbered from the most recently added one, to the oldest one.

export class ResultsSet {
  public constructor(private _directory: string) {
    if (!fs.existsSync(_directory)) {
      fs.mkdirSync(_directory, { recursive: true });
    }
  }

  /**
   *
   */
  public find(predicate: (value: Result) => boolean): [GitHash, Result] | undefined {
    for (const item of this.items()) {
      const result = Result.readFromFile(item.path);
      if (predicate(result)) {
        return [item.hash, result];
      }
    }
    return undefined;
  }

  /**
   *
   */
  public items(): ResultSetItem[] {
    return this._files()
      .map(file => {
        return new ResultSetItem(path.join(this._directory, file.name));
      })
      .filter(item => !isNaN(item.number))
      .sort((a, b) => a.number - b.number);
  }

  /**
   *
   */
  public async add(newFile: string, onlyIfDifferent: boolean = false): Promise<void> {
    console.log(`Preparing to add ${newFile} to ${this._directory}`);
    assert(fs.existsSync(newFile));

    // Get the list of file sorted by the prefix number in the descending order (starting with the oldest files).
    const files = this.items().sort((a, b) => b.number - a.number);

    if (onlyIfDifferent && files.length > 0) {
      const latestFile = files[files.length - 1];
      if (fs.readFileSync(latestFile.path, { encoding: 'utf-8' }) == fs.readFileSync(newFile, { encoding: 'utf-8' })) {
        console.log(`Skipping - it's already stored as ${latestFile.name}`);
        return;
      }
    }

    // Rename all existing files, increasing the prefix
    for (const file of files) {
      const parts = file.name.split(delimiter);
      parts[0] = (file.number + 1).toString();
      const newPath = path.join(this._directory, parts.join(delimiter));
      console.log(`Renaming ${file.path} to ${newPath}`);
      fs.renameSync(file.path, newPath);
    }

    const newName = `1${delimiter}${await Git.hash}${delimiter}result.json`;
    console.log(`Adding ${newFile} to ${this._directory} as ${newName}`);
    fs.copyFileSync(newFile, path.join(this._directory, newName));
  }

  /**
   *
   */
  private _files(): fs.Dirent[] {
    return fs.readdirSync(this._directory, { withFileTypes: true }).filter(v => v.isFile());
  }
}
