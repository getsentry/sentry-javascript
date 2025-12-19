import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

/**
 * Plugin that moves all .d.ts and .d.ts.map files from build/esm to build/types after the build completes.
 * This preserves the directory structure within the types directory.
 * Optimized for speed with parallel file operations.
 */
export function makeMoveDtsPlugin() {
  return {
    name: 'move-dts-files',
    async writeBundle() {
      const buildEsmDir = path.resolve(process.cwd(), 'build/esm');
      const buildTypesDir = path.resolve(process.cwd(), 'build/types');

      // Check if build/esm exists
      if (!fs.existsSync(buildEsmDir)) {
        return;
      }

      // Ensure build/types directory exists (recursive handles existing dirs)
      await fsPromises.mkdir(buildTypesDir, { recursive: true });

      /**
       * Recursively find all .d.ts and .d.ts.map files in a directory
       * @param {string} dir - Directory to search
       * @param {string} baseDir - Base directory for relative path calculation
       * @returns {Array<{relativePath: string, fullPath: string, targetPath: string}>} Array of file info objects
       */
      function findDtsFiles(dir, baseDir = dir) {
        const files = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);

          if (entry.isDirectory()) {
            files.push(...findDtsFiles(fullPath, baseDir));
          } else if (entry.isFile() && (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.ts.map'))) {
            const targetPath = path.join(buildTypesDir, relativePath);
            files.push({ relativePath, fullPath, targetPath });
          }
        }

        return files;
      }

      const dtsFiles = findDtsFiles(buildEsmDir);

      // Early exit if no files to move
      if (dtsFiles.length === 0) {
        return;
      }

      // Collect all unique directories that need to be created
      const dirsToCreate = new Set();
      for (const { targetPath } of dtsFiles) {
        const targetDir = path.dirname(targetPath);
        if (targetDir !== buildTypesDir) {
          dirsToCreate.add(targetDir);
        }
      }

      // Create all directories in parallel
      await Promise.all(Array.from(dirsToCreate).map(dir => fsPromises.mkdir(dir, { recursive: true })));

      // Move all files in parallel
      await Promise.all(dtsFiles.map(({ fullPath, targetPath }) => fsPromises.rename(fullPath, targetPath)));
    },
  };
}
