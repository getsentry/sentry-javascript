import * as fs from 'fs';
import path from 'path';

const delimiter = '-';

export class ResultSetItem {
  public constructor(public path: string) { }

  public get name(): string {
    return path.basename(this.path);
  }

  public get number(): number {
    return parseInt(this.parts[0]);
  }

  public get hash(): string {
    return this.parts[1];
  }

  get parts(): string[] {
    return path.basename(this.path).split(delimiter);
  }
}

/// Wraps a directory containing multiple (N-<git-hash>-result.json) files.
/// The files are numbered from the most recently added one, to the oldest one.
export class ResultsSet {
  public constructor(private directory: string) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  public count(): number {
    return this.items().length;
  }

  public items(): ResultSetItem[] {
    return this.files().map((file) => {
      return new ResultSetItem(path.join(this.directory, file.name));
    }).filter((item) => !isNaN(item.number));
  }

  files(): fs.Dirent[] {
    return fs.readdirSync(this.directory, { withFileTypes: true }).filter((v) => v.isFile())
  }

  public add(file: ResultSetItem) {
    console.log(`Preparing to add ${file.path} to ${this.directory}`);

    // Get the list of file sorted by the prefix number in the descending order.
    const files = this.items().sort((a, b) => b.number - a.number);

    // Rename all existing files, increasing the prefix
    for (const file of files) {
      const parts = file.name.split(delimiter);
      parts[0] = (file.number + 1).toString();
      const newPath = path.join(this.directory, parts.join(delimiter));
      console.log(`Renaming ${file.path} to ${newPath}`);
      fs.renameSync(file.path, newPath);
    }

    const newName = `1${delimiter}${file.hash}${delimiter}result.json`;
    console.log(`Adding ${file.path} to ${this.directory} as ${newName}`);
    fs.copyFileSync(file.path, path.join(this.directory, newName));
  }
}
