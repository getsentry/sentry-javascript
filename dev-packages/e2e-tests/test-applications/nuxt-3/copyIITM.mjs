import fs from 'fs';
import path from 'path';

/*  This script copies the `import-in-the-middle` content of the E2E test project root `node_modules` to the build output `node_modules`
    For some reason, some files are missing in the output (like `hook.mjs`) and this is not reproducible in external, standalone projects.

    Things we tried (that did not fix the problem):
    - Adding a resolution for `@vercel/nft` v0.27.0 (this worked in the standalone project)
    - Also adding `@vercel/nft` v0.27.0 to pnpm `peerDependencyRules`
 */
function copyFolderSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getSourceFolder() {
  const specificVersionFolder = `node_modules${path.sep}.pnpm${path.sep}import-in-the-middle@1.11.2${path.sep}node_modules${path.sep}import-in-the-middle`;

  if (fs.existsSync(specificVersionFolder)) {
    return specificVersionFolder;
  }

  const parentFolder = `node_modules${path.sep}.pnpm`;
  const folders = fs.readdirSync(parentFolder, { withFileTypes: true });

  for (let folder of folders) {
    if (folder.isDirectory() && folder.name.startsWith('import-in-the-middle@')) {
      return path.join(parentFolder, folder.name, 'node_modules', 'import-in-the-middle');
    }
  }

  throw new Error('No suitable import-in-the-middle folder found');
}

const sourceFolder = getSourceFolder();
const destinationFolder = `.output${path.sep}server${path.sep}node_modules${path.sep}import-in-the-middle`;

copyFolderSync(sourceFolder, destinationFolder);
