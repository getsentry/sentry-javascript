import { readFileSync } from 'fs';
import { join } from 'path';
import { getNewGitCommits } from './get-commit-list';

type EntryType = 'important' | 'other' | 'internal';

interface ChangelogEntry {
  type: EntryType;
  content: string;
  sortKey: string;
  prNumber: string | null;
}

// ============================================================================
// Changelog Parsing
// ============================================================================

interface ParsedChangelog {
  importantChanges: ChangelogEntry[];
  otherChanges: ChangelogEntry[];
  internalChanges: ChangelogEntry[];
  changelogPRs: Set<string>;
  contributorsLine: string;
}

function getUnreleasedSection(content: string): string[] {
  const lines = content.split('\n');

  const unreleasedIndex = lines.findIndex(line => line.trim() === '## Unreleased');
  if (unreleasedIndex === -1) {
    // eslint-disable-next-line no-console
    console.error('Could not find "## Unreleased" section in CHANGELOG.md');
    process.exit(1);
  }

  const nextVersionIndex = lines.findIndex((line, index) => index > unreleasedIndex && /^## \d+\.\d+\.\d+/.test(line));
  if (nextVersionIndex === -1) {
    // eslint-disable-next-line no-console
    console.error('Could not find next version section after "## Unreleased"');
    process.exit(1);
  }

  return lines.slice(unreleasedIndex + 1, nextVersionIndex);
}

function createEntry(content: string, type: EntryType): ChangelogEntry {
  const firstLine = content.split('\n')[0] ?? content;
  const prNumber = extractPRNumber(firstLine);
  return {
    type,
    content,
    sortKey: extractSortKey(firstLine),
    prNumber,
  };
}

function parseChangelog(unreleasedLines: string[]): ParsedChangelog {
  const importantChanges: ChangelogEntry[] = [];
  const otherChanges: ChangelogEntry[] = [];
  const internalChanges: ChangelogEntry[] = [];
  const changelogPRs = new Set<string>();
  let contributorsLine = '';

  let currentEntry: string[] = [];
  let currentType: EntryType | null = null;
  let inDetailsBlock = false;
  let detailsContent: string[] = [];

  const addEntry = (entry: ChangelogEntry): void => {
    if (entry.prNumber) {
      changelogPRs.add(entry.prNumber);
    }

    if (entry.type === 'important') {
      importantChanges.push(entry);
    } else if (entry.type === 'internal') {
      internalChanges.push(entry);
    } else {
      otherChanges.push(entry);
    }
  };

  const flushCurrentEntry = (): void => {
    if (currentEntry.length === 0 || !currentType) return;

    // Remove trailing empty lines from the entry
    while (currentEntry.length > 0 && !currentEntry[currentEntry.length - 1]?.trim()) {
      currentEntry.pop();
    }

    if (currentEntry.length === 0) return;

    const entry = createEntry(currentEntry.join('\n'), currentType);
    addEntry(entry);

    currentEntry = [];
    currentType = null;
  };

  const processDetailsContent = (): void => {
    for (const line of detailsContent) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') && trimmed.includes('(#')) {
        const entry = createEntry(trimmed, 'internal');
        addEntry(entry);
      }
    }
    detailsContent = [];
  };

  for (const line of unreleasedLines) {
    // Skip undefined/null lines
    if (line == null) continue;

    // Skip empty lines at the start of an entry
    if (!line.trim() && currentEntry.length === 0) continue;

    // Skip quote lines
    if (isQuoteLine(line)) continue;

    // Capture contributors line
    if (isContributorsLine(line)) {
      contributorsLine = line;
      continue;
    }

    // Skip section headings
    if (isSectionHeading(line)) {
      flushCurrentEntry();
      continue;
    }

    // Handle details block
    if (line.includes('<details>')) {
      inDetailsBlock = true;
      detailsContent = [];
      continue;
    }

    if (line.includes('</details>')) {
      inDetailsBlock = false;
      processDetailsContent();
      continue;
    }

    if (inDetailsBlock) {
      if (!line.includes('<summary>')) {
        detailsContent.push(line);
      }
      continue;
    }

    // Handle regular entries
    if (line.trim().startsWith('- ')) {
      flushCurrentEntry();
      currentEntry = [line];
      currentType = determineEntryType(line);
    } else if (currentEntry.length > 0) {
      currentEntry.push(line);
    }
  }

  flushCurrentEntry();

  return { importantChanges, otherChanges, internalChanges, changelogPRs, contributorsLine };
}

// ============================================================================
// Output Generation
// ============================================================================

export function sortEntries(entries: ChangelogEntry[]): void {
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function generateOutput(
  importantChanges: ChangelogEntry[],
  otherChanges: ChangelogEntry[],
  internalChanges: ChangelogEntry[],
  contributorsLine: string,
): string {
  const output: string[] = [];

  if (importantChanges.length > 0) {
    output.push('### Important Changes', '');
    for (const entry of importantChanges) {
      output.push(entry.content, '');
    }
  }

  if (otherChanges.length > 0) {
    output.push('### Other Changes', '');
    for (const entry of otherChanges) {
      output.push(entry.content);
    }
    output.push('');
  }

  if (internalChanges.length > 0) {
    output.push('<details>', '  <summary><strong>Internal Changes</strong></summary>', '');
    for (const entry of internalChanges) {
      output.push(entry.content);
    }
    output.push('', '</details>', '');
  }

  if (contributorsLine) {
    output.push(contributorsLine);
  }

  return output.join('\n');
}

// ============================================================================
// Main
// ============================================================================

function run(): void {
  const changelogPath = join(__dirname, '..', 'CHANGELOG.md');
  const changelogContent = readFileSync(changelogPath, 'utf-8');
  const unreleasedLines = getUnreleasedSection(changelogContent);

  // Parse existing changelog entries
  const { importantChanges, otherChanges, internalChanges, changelogPRs, contributorsLine } =
    parseChangelog(unreleasedLines);

  // Add new git commits that aren't already in the changelog
  for (const commit of getNewGitCommits()) {
    const prNumber = extractPRNumber(commit);

    // Skip duplicates
    if (prNumber && changelogPRs.has(prNumber)) {
      continue;
    }

    const entry = createEntry(commit, isInternalCommit(commit) ? 'internal' : 'other');

    if (entry.type === 'internal') {
      internalChanges.push(entry);
    } else {
      otherChanges.push(entry);
    }
  }

  // Sort all categories
  sortEntries(importantChanges);
  sortEntries(otherChanges);
  sortEntries(internalChanges);

  // eslint-disable-next-line no-console
  console.log(generateOutput(importantChanges, otherChanges, internalChanges, contributorsLine));
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractPRNumber(line: string): string | null {
  const match = line.match(/#(\d+)/);
  return match?.[1] ?? null;
}

function extractSortKey(line: string): string {
  return line
    .trim()
    .replace(/^- /, '')
    .replace(/\*\*/g, '')
    .replace(/\s*\(\[#\d+\].*?\)\s*$/, '')
    .toLowerCase();
}

function isQuoteLine(line: string): boolean {
  return line.includes('—') && (line.includes('Wayne Gretzky') || line.includes('Michael Scott'));
}

function isContributorsLine(line: string): boolean {
  return line.includes('Work in this release was contributed by');
}

function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === '### Important Changes' || trimmed === '### Other Changes';
}

function isInternalCommit(line: string): boolean {
  return /^- (chore|ref|test|meta)/.test(line.trim());
}

function isImportantEntry(line: string): boolean {
  return line.includes('**feat') || line.includes('**fix');
}

function determineEntryType(line: string): EntryType {
  if (isImportantEntry(line)) {
    return 'important';
  }
  if (isInternalCommit(line)) {
    return 'internal';
  }
  return 'other';
}

run();
