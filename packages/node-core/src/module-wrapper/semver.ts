/**
 * Lightweight semantic versioning utilities.
 *
 * This is a simplified semver implementation that only supports basic comparison
 * operators (<, <=, >, >=, =). Comparators may use a major-only bound (e.g. `<6` as
 * `<6.0.0`). For module wrapper version checking, these operators combined with
 * space-separated AND ranges and || OR ranges are sufficient.
 *
 * Unsupported patterns (caret ^, tilde ~, hyphen ranges, x-ranges) will log a warning.
 */

import { debug } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

const VERSION_REGEXP =
  /^(?:v)?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+(?<build>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const COMPARATOR_REGEXP =
  /^(?<op><|>|<=|>=|=)?(?:v)?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

/** Major-only bound (e.g. `<6`, `>=2`) — interpreted as `<6.0.0`, `>=2.0.0`. */
const MAJOR_ONLY_COMPARATOR_REGEXP = /^(?<op><|>|<=|>=|=)?(?:v)?(?<major>0|[1-9]\d*)$/;

const UNSUPPORTED_PATTERN = /[~^*xX]| - /;

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
}

interface ParsedComparator {
  op: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string[];
}

/**
 * Checks if a given version satisfies a given range expression.
 *
 * Supported operators: <, <=, >, >=, = (or no operator for exact match)
 * Supported combinators: space for AND, || for OR
 *
 * Examples:
 * - ">=1.0.0 <2.0.0" - version must be >= 1.0.0 AND < 2.0.0
 * - ">=1.0.0 || >=2.0.0 <3.0.0" - version must match either range
 *
 * @param version - The version to check (e.g., "1.2.3")
 * @param range - The range expression (e.g., ">=1.0.0 <2.0.0")
 * @returns true if the version satisfies the range
 */
export function satisfies(version: string, range: string): boolean {
  // Empty range matches everything
  if (!range?.trim()) {
    return true;
  }

  // Parse the version
  const parsedVersion = parseVersion(version);
  if (!parsedVersion) {
    DEBUG_BUILD && debug.warn(`[semver] Invalid version: ${version}`);
    return false;
  }

  // Warn about unsupported patterns
  if (UNSUPPORTED_PATTERN.test(range)) {
    DEBUG_BUILD &&
      debug.warn(
        `[semver] Range "${range}" contains unsupported patterns (^, ~, *, x, X, or hyphen ranges). ` +
          `Only <, <=, >, >=, = operators are supported. This may not match as expected.`,
      );
  }

  // Handle OR ranges (||)
  if (range.includes('||')) {
    const orParts = range.split('||').map(p => p.trim());
    return orParts.some(part => satisfiesRange(parsedVersion, part));
  }

  return satisfiesRange(parsedVersion, range);
}

/**
 * Check if a version satisfies a single range (no || operators).
 */
function satisfiesRange(version: ParsedVersion, range: string): boolean {
  // Split by whitespace for AND conditions
  const comparators = range
    .trim()
    .split(/\s+/)
    .filter(c => c.length > 0);

  // All comparators must match
  return comparators.every(comp => satisfiesComparator(version, comp));
}

/**
 * Check if a version satisfies a single comparator.
 */
function satisfiesComparator(version: ParsedVersion, comparator: string): boolean {
  const parsed = parseComparator(comparator);
  if (!parsed) {
    DEBUG_BUILD && debug.warn(`[semver] Invalid comparator: ${comparator}`);
    return false;
  }

  const cmp = compareVersions(version, parsed);

  switch (parsed.op) {
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '=':
    default:
      return cmp === 0;
  }
}

/**
 * Parse a version string into components.
 */
function parseVersion(version: string): ParsedVersion | undefined {
  const match = version.match(VERSION_REGEXP);
  if (!match?.groups) {
    return undefined;
  }

  const { major, minor, patch, prerelease } = match.groups;
  if (major === undefined || minor === undefined || patch === undefined) {
    return undefined;
  }

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease ? prerelease.split('.') : undefined,
  };
}

/**
 * Parse a comparator string into components.
 */
function parseComparator(comparator: string): ParsedComparator | undefined {
  const match = comparator.match(COMPARATOR_REGEXP);
  if (match?.groups) {
    const { op, major, minor, patch, prerelease } = match.groups;
    if (major !== undefined && minor !== undefined && patch !== undefined) {
      return {
        op: op || '=',
        major: parseInt(major, 10),
        minor: parseInt(minor, 10),
        patch: parseInt(patch, 10),
        prerelease: prerelease ? prerelease.split('.') : undefined,
      };
    }
  }

  const majorOnly = comparator.match(MAJOR_ONLY_COMPARATOR_REGEXP);
  if (majorOnly?.groups) {
    const { op, major } = majorOnly.groups;
    if (major !== undefined) {
      return {
        op: op || '=',
        major: parseInt(major, 10),
        minor: 0,
        patch: 0,
      };
    }
  }

  return undefined;
}

/**
 * Compare two versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: ParsedVersion, b: ParsedComparator): number {
  // Compare major.minor.patch
  if (a.major !== b.major) {
    return a.major < b.major ? -1 : 1;
  }
  if (a.minor !== b.minor) {
    return a.minor < b.minor ? -1 : 1;
  }
  if (a.patch !== b.patch) {
    return a.patch < b.patch ? -1 : 1;
  }

  // Compare prerelease
  // A version without prerelease has higher precedence than one with prerelease
  if (!a.prerelease && b.prerelease) {
    return 1;
  }
  if (a.prerelease && !b.prerelease) {
    return -1;
  }
  if (a.prerelease && b.prerelease) {
    return comparePrereleases(a.prerelease, b.prerelease);
  }

  return 0;
}

/**
 * Compare prerelease identifiers.
 */
function comparePrereleases(a: string[], b: string[]): number {
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i++) {
    // If a has fewer identifiers, it has lower precedence
    if (i >= a.length) {
      return -1;
    }
    // If b has fewer identifiers, a has higher precedence
    if (i >= b.length) {
      return 1;
    }

    // We've already checked bounds above, so these are safe
    const aId = a[i]!;
    const bId = b[i]!;

    if (aId === bId) {
      continue;
    }

    const aNum = parseInt(aId, 10);
    const bNum = parseInt(bId, 10);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    // Numeric identifiers have lower precedence than string identifiers
    if (aIsNum && !bIsNum) {
      return -1;
    }
    if (!aIsNum && bIsNum) {
      return 1;
    }

    // Both numeric: compare as numbers
    if (aIsNum && bIsNum) {
      return aNum < bNum ? -1 : 1;
    }

    // Both strings: compare lexically
    return aId < bId ? -1 : 1;
  }

  return 0;
}
