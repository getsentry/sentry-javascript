import * as fs from 'fs';

import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addImportStatement, buildSdkInitFileImportSnippet } from '../../src/common/snippets';

describe('Nuxt Code Snippets', () => {
  describe('buildSdkInitFileImportSnippet', () => {
    it('returns correct import statement for POSIX path', () => {
      const filePath = 'src/myFile.ts';
      const expectedOutput = "import 'src/myFile.ts';";
      const result = buildSdkInitFileImportSnippet(filePath);
      expect(result).toBe(expectedOutput);
    });

    it('returns correct import statement for Windows path', () => {
      const filePath = 'src\\myFile.ts';
      const expectedOutput = "import 'src/myFile.ts';";
      const result = buildSdkInitFileImportSnippet(filePath);
      expect(result).toBe(expectedOutput);
    });

    it('returns correct import statement for path with multiple segments', () => {
      const filePath = path.join('src', 'myDir', 'myFile.ts');
      const expectedOutput = "import 'src/myDir/myFile.ts';";
      const result = buildSdkInitFileImportSnippet(filePath);
      expect(result).toBe(expectedOutput);
    });
  });

  describe('addImportStatement', () => {
    vi.mock('fs');

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should add import statement to file', () => {
      const readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
      const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

      const filePath = 'testFile.ts';
      const importStatement = 'import { test } from "./test";';
      const fileContent =
        '<template>\n' +
        '  <Suspense @resolve="onResolve">\n' +
        '  </Suspense>\n' +
        '</template>\n' +
        '\n' +
        '<script setup>\n' +
        "import { provide } from 'vue'\n" +
        "import { useNuxtApp } from '../nuxt'";

      const fileContentExpected =
        '<template>\n' +
        '  <Suspense @resolve="onResolve">\n' +
        '  </Suspense>\n' +
        '</template>\n' +
        '\n' +
        '<script setup>\n' +
        `${importStatement}\n` +
        "import { provide } from 'vue'\n" +
        "import { useNuxtApp } from '../nuxt'";

      readFileSyncSpy.mockReturnValue(fileContent);
      writeFileSyncSpy.mockImplementation(() => {});

      addImportStatement(filePath, importStatement);

      expect(fs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
      expect(fs.writeFileSync).toHaveBeenCalledWith(filePath, fileContentExpected, 'utf8');
    });
  });
});
