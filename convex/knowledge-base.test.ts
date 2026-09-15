// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const docsRoot = join(process.cwd(), 'docs');
const readmePath = join(docsRoot, 'README.md');

function markdownFiles(directory = docsRoot): Array<string> {
  const files: Array<string> = [];

  for (const entry of readdirSync(directory)) {
    if (entry.startsWith('.')) {
      continue;
    }

    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...markdownFiles(path));
      continue;
    }

    if (entry.endsWith('.md')) {
      files.push(path);
    }
  }

  return files.sort();
}

function docsRelativePath(path: string) {
  return relative(docsRoot, path);
}

describe('repository knowledge base', () => {
  test('README indexes every durable docs page', () => {
    const readme = readFileSync(readmePath, 'utf8');
    const missing = markdownFiles()
      .filter((file) => file !== readmePath)
      .map(docsRelativePath)
      .filter((path) => !readme.includes(path));

    expect(missing).toEqual([]);
  });

  test('decision records include explicit status metadata', () => {
    const missingStatus = markdownFiles(join(docsRoot, 'decisions'))
      .map((file) => ({
        file: docsRelativePath(file),
        source: readFileSync(file, 'utf8'),
      }))
      .filter(({ source }) => !/^Status:\s+\S+/m.test(source))
      .map(({ file }) => file);

    expect(missingStatus).toEqual([]);
  });

  test('execution plans include status and verification sections', () => {
    const incompletePlans = markdownFiles(join(docsRoot, 'execution-plans'))
      .map((file) => ({
        file: docsRelativePath(file),
        source: readFileSync(file, 'utf8'),
      }))
      .filter(({ source }) => !/^Status:\s+\S+/m.test(source) || !/^## Current Verification Evidence/m.test(source))
      .map(({ file }) => file);

    expect(incompletePlans).toEqual([]);
  });
});
