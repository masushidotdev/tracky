// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

const convexRoot = join(process.cwd(), 'convex');
const srcRoot = join(process.cwd(), 'src');
const ignoredDirectories = new Set(['_generated']);

function sourceFiles(directory: string, options?: { ignoredDirectories?: Set<string> }): Array<string> {
  const files: Array<string> = [];

  for (const entry of readdirSync(directory)) {
    if (entry.startsWith('.')) {
      continue;
    }

    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (!options?.ignoredDirectories?.has(entry)) {
        files.push(...sourceFiles(path, options));
      }
      continue;
    }

    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(path);
    }
  }

  return files.sort();
}

function convexSourceFiles() {
  return sourceFiles(convexRoot, { ignoredDirectories });
}

function frontendSourceFiles() {
  return sourceFiles(srcRoot);
}

function frontendSourceAndTsxFiles() {
  const files: Array<string> = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory)) {
      if (entry.startsWith('.')) {
        continue;
      }

      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }

      if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        files.push(path);
      }
    }
  }

  walk(srcRoot);
  return files.sort();
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ');
}

function matchingBraceIndex(source: string, openBraceIndex: number) {
  let depth = 0;
  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

type PublicFunctionObject = {
  name: string;
  object: string;
};

function publicFunctionObjects(source: string) {
  const objects: Array<PublicFunctionObject> = [];
  const pattern = /export\s+const\s+(\w+)\s*=\s*(?:query|mutation|action)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    const openBraceIndex = source.indexOf('{', match.index + match[0].length);
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = matchingBraceIndex(source, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    objects.push({
      name: match[1],
      object: source.slice(openBraceIndex, closeBraceIndex + 1),
    });
    pattern.lastIndex = closeBraceIndex + 1;
  }

  return objects;
}

function argsObjectForFunction(functionObject: string, source: string) {
  const argsMatch = /\bargs\s*:/.exec(functionObject);
  if (!argsMatch) {
    return null;
  }

  const rest = functionObject.slice(argsMatch.index + argsMatch[0].length);
  // `args:` can name a validator instead of inlining one. Resolve it in the same file rather than
  // scanning ahead for the next brace, which used to land inside the handler body and read its
  // `userId: user.id` as a client-supplied argument.
  const named = /^\s*([A-Za-z_$][\w$]*)\s*,/.exec(rest);
  if (named) {
    const declaration = new RegExp(`\\b(?:const|let|var)\\s+${named[1]}\\s*=`).exec(source);
    if (!declaration) return null;
    const declarationBrace = source.indexOf('{', declaration.index + declaration[0].length);
    if (declarationBrace === -1) return null;
    const declarationEnd = matchingBraceIndex(source, declarationBrace);
    return declarationEnd === -1 ? null : source.slice(declarationBrace, declarationEnd + 1);
  }

  const openBraceIndex = functionObject.indexOf('{', argsMatch.index + argsMatch[0].length);
  if (openBraceIndex === -1) {
    return null;
  }

  const closeBraceIndex = matchingBraceIndex(functionObject, openBraceIndex);
  if (closeBraceIndex === -1) {
    return null;
  }

  return functionObject.slice(openBraceIndex, closeBraceIndex + 1);
}

describe('architecture invariants', () => {
  test('Convex database queries do not use runtime filters', () => {
    const violations: Array<string> = [];

    for (const file of convexSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      const statements = source.split(';');

      for (const statement of statements) {
        if (/ctx\.db\s*\.\s*query\s*\(/.test(statement) && /\.filter\s*\(/.test(statement)) {
          violations.push(`${relative(process.cwd(), file)}: ${compactWhitespace(statement).trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('account balances are never read one row at a time', () => {
    // A provider writes several rows per fetch — two for one provider, three for another — and only the
    // selector in `banking/balances.ts` knows which one is the accounting position. Taking the
    // first row the index returns picks between them by coin flip.
    const violations: Array<string> = [];
    const singleRowRead = /\.(?:take\s*\(\s*1\s*\)|first\s*\(\s*\)|unique\s*\(\s*\))/;

    for (const file of convexSourceFiles()) {
      const source = readFileSync(file, 'utf8');

      for (const statement of source.split(';')) {
        if (/ctx\.db\s*\.\s*query\s*\(\s*['"]accountBalances['"]/.test(statement) && singleRowRead.test(statement)) {
          violations.push(`${relative(process.cwd(), file)}: ${compactWhitespace(statement).trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('public Convex functions do not accept client supplied user ids', () => {
    const violations: Array<string> = [];

    for (const file of convexSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const functionObject of publicFunctionObjects(source)) {
        const argsObject = argsObjectForFunction(functionObject.object, source);
        if (argsObject && /\buserId\s*:/.test(argsObject)) {
          violations.push(`${relative(process.cwd(), file)}: ${compactWhitespace(argsObject).trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('public Convex functions derive auth server-side', () => {
    const violations: Array<string> = [];
    const serverSideAuthPattern = /\b(?:requireAuthUser)\s*\(|ctx\s*\.\s*auth\s*\.\s*getUserIdentity\s*\(/;

    for (const file of convexSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const functionObject of publicFunctionObjects(source)) {
        if (!serverSideAuthPattern.test(functionObject.object)) {
          violations.push(`${relative(process.cwd(), file)}: ${functionObject.name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('frontend does not call banking provider endpoints or read provider secrets directly', () => {
    const violations: Array<string> = [];
    const disallowedFrontendProviderPatterns = [
      /\bENABLE_BANKING[A-Z0-9_]*\b/,
      /\benablebanking\.com\b/,
      /\bapi\.enablebanking\.com\b/,
      /['"`]\/(?:aspsps|sessions|accounts\/[^'"`]*|auth)['"`]/,
      /\b(?:private_key|client_secret)\b/i,
    ];

    for (const file of frontendSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of disallowedFrontendProviderPatterns) {
        if (pattern.test(source)) {
          violations.push(`${relative(process.cwd(), file)}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('TanStack devtools never load in production builds', () => {
    // The devtools panel was shipped to production as a static import in
    // `src/routes/__root.tsx`. Devtools imports must live only in the
    // dev-gated `src/components/devtools.tsx`, and the root route must gate
    // the lazy import behind `import.meta.env.DEV` so Vite drops the chunk
    // from production builds.
    const devtoolsImport = /from\s+['"]@tanstack\/react-(?:form-|router-)?devtools['"]/;
    const violations: Array<string> = [];

    for (const file of frontendSourceAndTsxFiles()) {
      const relativePath = relative(process.cwd(), file);
      if (relativePath === join('src', 'components', 'devtools.tsx')) {
        continue;
      }
      if (devtoolsImport.test(readFileSync(file, 'utf8'))) {
        violations.push(relativePath);
      }
    }

    expect(violations).toEqual([]);

    const rootSource = readFileSync(join(srcRoot, 'routes', '__root.tsx'), 'utf8');
    expect(devtoolsImport.test(rootSource)).toBe(false);
    expect(rootSource).toContain('import.meta.env.DEV');
    expect(rootSource).toContain('@/components/devtools');
  });

  test('Geist stays self-hosted from public/fonts', () => {
    // A bare `@import '@fontsource-variable/geist'` breaks in production:
    // tailwind's postcss inlining rewrites its relative url() to an
    // absolute filesystem path that vite leaves unresolved, 404ing every
    // weight. Fonts must be explicit @font-face blocks over /fonts/*.woff2.
    const appCss = readFileSync(join(srcRoot, 'app.css'), 'utf8');
    expect(appCss).not.toMatch(/^@import\s+['"]@fontsource-variable\/geist/m);
    expect(appCss).toContain("url('/fonts/geist-latin-wght-normal.woff2')");
    expect(appCss).toContain("url('/fonts/geist-latin-ext-wght-normal.woff2')");

    const fontsDir = join(process.cwd(), 'public', 'fonts');
    for (const file of ['geist-latin-wght-normal.woff2', 'geist-latin-ext-wght-normal.woff2']) {
      expect(statSync(join(fontsDir, file)).isFile()).toBe(true);
    }
  });
});
