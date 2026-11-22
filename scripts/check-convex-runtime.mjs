import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { build } from 'esbuild';

const root = resolve('convex');
const require = createRequire(import.meta.url);
function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === '_generated') return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(?:[cm]?[jt]sx?)$/.test(path) &&
      !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(path) &&
      !entry.name.startsWith('setup.')
      ? [path]
      : [];
  });
}
const appSources = sources(root);
const config = ts.createSourceFile(
  'convex.config.ts',
  readFileSync(join(root, 'convex.config.ts'), 'utf8'),
  ts.ScriptTarget.Latest,
);
const componentRoots = config.statements
  .filter(ts.isImportDeclaration)
  .map((statement) => statement.moduleSpecifier.text)
  .filter((name) => name.endsWith('/convex.config'))
  .map((name) => dirname(require.resolve(name)));
const allSources = [...new Set([...appSources, ...componentRoots.flatMap(sources)])];
for (const path of allSources) {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
  if (
    file.statements.some(
      (statement) =>
        ts.isExpressionStatement(statement) &&
        ts.isStringLiteral(statement.expression) &&
        statement.expression.text === 'use node',
    )
  ) {
    throw new Error(`${relative(process.cwd(), path)} selects the prohibited managed Node runtime`);
  }
}
const entryPoints = allSources.filter((path) => !path.endsWith('convex.config.ts'));
const result = await build({
  entryPoints,
  outdir: join(tmpdir(), 'tracky-convex-runtime-check'),
  write: false,
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  conditions: ['convex', 'module'],
  treeShaking: true,
  metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
  plugins: [
    {
      name: 'convex-runtime-globals',
      setup(builder) {
        // Match the Convex CLI: only AsyncLocalStorage/AsyncResource are available built-ins.
        builder.onResolve({ filter: /^(node:)?async_hooks$/ }, (args) => ({
          path: args.path,
          namespace: 'convex-globals',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'convex-globals' }, () => ({
          contents:
            'export const AsyncLocalStorage = globalThis.AsyncLocalStorage; export const AsyncResource = globalThis.AsyncResource; export default { AsyncLocalStorage, AsyncResource };',
        }));
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty-server-only' }));
        builder.onLoad({ filter: /.*/, namespace: 'empty-server-only' }, () => ({ contents: '' }));
      },
    },
  ],
});
console.log(
  `Convex runtime policy passed: ${appSources.length} application files and ${componentRoots.length} components; ${Object.keys(result.metafile.inputs).length} bundled inputs use the standard runtime.`,
);
