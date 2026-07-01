#!/usr/bin/env node
// @ts-nocheck

/**
 * Dependency Graph Generator for math-mcp.
 *
 * Adapted from the Mathjs version (which targeted factory-function deps).
 * math-mcp uses plain ESM, so this version focuses on:
 *
 *   1. File-level imports — which src/ file imports which.
 *   2. Folder-level dependencies — aggregated up to subsystem boundaries.
 *   3. Test-coverage map — for each src/ file, which test/ file(s) import it.
 *      This makes the audit's "coverage matrix" machine-checkable.
 *   4. Layer-violation report — flags imports that go from a lower-numbered
 *      layer to a higher one (per the Task 20 STRUCTURE-AUDIT layering map).
 *      A clean codebase has zero violations.
 *
 * Outputs (all in tools/):
 *   - dependency-graph.json     — machine-readable
 *   - dependency-graph.md       — human-readable
 *   - dependency-graph.mermaid  — visualization (top-level folders only)
 *
 * Run with:
 *   npx tsx tools/generate-dependency-graph.ts
 *
 * Scans: src/**\/*.ts, test/**\/*.ts (no .js because the project is
 * TS-first; .cjs WASM bindings under wasm/bindings/ are skipped).
 */

import fs from 'fs';
import path from 'path';
import { parseSync } from '@babel/core';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(REPO_ROOT, 'src');
const TEST_DIR = path.join(REPO_ROOT, 'test');
const OUTPUT_DIR = __dirname;

/**
 * Layer map for the v4 (MathTS) source tree, derived from the actual import
 * graph (each file sits one layer above its deepest internal dependency).
 * Lower number = lower layer. Imports must point downward (from a higher
 * layer to a lower or equal layer). An import from layer N pointing to
 * something in layer M > N is a layering violation.
 *
 * Files not listed get layer 99 (treated as top-level/orchestrator).
 * Match is by relative path under src/, longest-prefix wins.
 *
 * NOTE: the pre-v4 acceleration stack (wasm/workers/gpu/router/adapter) was
 * deleted in v4; those entries were removed here on 2026-07-01.
 */
const LAYER_MAP: Array<{ pattern: string; layer: number; name: string }> = [
  // L1 — primitives / leaves (no internal imports)
  { pattern: 'shared/constants.ts', layer: 1, name: 'L1' },
  { pattern: 'shared/logger.ts', layer: 1, name: 'L1' },
  { pattern: 'errors.ts', layer: 1, name: 'L1' },
  { pattern: 'types.ts', layer: 1, name: 'L1' },
  { pattern: 'math-engine.ts', layer: 1, name: 'L1' },
  // L2 — core utilities (import only L1)
  { pattern: 'utils.ts', layer: 2, name: 'L2' },
  { pattern: 'validation.ts', layer: 2, name: 'L2' },
  // L3 — services built on utils
  { pattern: 'expression-cache.ts', layer: 3, name: 'L3' },
  { pattern: 'rate-limiter.ts', layer: 3, name: 'L3' },
  { pattern: 'handler-utils.ts', layer: 3, name: 'L3' },
  { pattern: 'telemetry/metrics.ts', layer: 3, name: 'L3' },
  // L4 — health (uses rate-limiter)
  { pattern: 'health.ts', layer: 4, name: 'L4' },
  // L5 — telemetry server (uses health + metrics)
  { pattern: 'telemetry/server.ts', layer: 5, name: 'L5' },
  // L6 — tool handlers (orchestrate engine + validation + services)
  { pattern: 'tool-handlers.ts', layer: 6, name: 'L6' },
  // L7 — entry point / orchestrator
  { pattern: 'index.ts', layer: 7, name: 'L7' },
];

const graph = {
  files: {},        // path -> { imports, exports, layer }
  folders: {},      // folder -> [folder, ...]
  tests: {},        // src path -> [test path, ...]
  layerViolations: [],  // [{ from, fromLayer, to, toLayer }]
  stats: {
    totalFiles: 0,
    srcFiles: 0,
    testFiles: 0,
    totalDependencies: 0,
    avgDependenciesPerFile: 0,
    mostDependedOn: [],
    untestedSrcFiles: [],
  },
};

function getLayer(relativePath: string): { layer: number; name: string } {
  let best = { layer: 99, name: 'L?' };
  let bestPrefixLen = -1;
  for (const entry of LAYER_MAP) {
    const matches = entry.pattern.endsWith('/')
      ? relativePath.startsWith(entry.pattern)
      : relativePath === entry.pattern;
    if (matches && entry.pattern.length > bestPrefixLen) {
      best = { layer: entry.layer, name: entry.name };
      bestPrefixLen = entry.pattern.length;
    }
  }
  return best;
}

function parseFile(filePath: string, baseDir: string) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
  const isTS = filePath.endsWith('.ts');

  const fileInfo = {
    path: relativePath,
    fullPath: filePath,
    imports: [] as Array<{ source: string }>,
    exports: [] as string[],
    layer: 99,
    layerName: 'L?',
  };

  // For src/ files, set layer
  if (baseDir === SRC_DIR) {
    const { layer, name } = getLayer(relativePath);
    fileInfo.layer = layer;
    fileInfo.layerName = name;
  }

  try {
    const ast = parseSync(code, {
      sourceType: 'module',
      filename: filePath,
      // babel 8 removed `allExtensions`/`isTSX`; `ignoreExtensions: true` is the
      // replacement — parse as TS without extension-based JSX detection (this repo
      // has no .tsx files, so JSX parsing is intentionally off).
      presets: isTS
        ? [['@babel/preset-typescript', { ignoreExtensions: true }]]
        : [],
      plugins: [],
    });

    ast.program.body.forEach(node => {
      if (node.type === 'ImportDeclaration') {
        fileInfo.imports.push({ source: node.source.value });
      }
      if (node.type === 'ExportNamedDeclaration' && node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          node.declaration.declarations.forEach(decl => {
            if (decl.id?.name) fileInfo.exports.push(decl.id.name);
          });
        } else if (node.declaration.type === 'FunctionDeclaration') {
          if (node.declaration.id?.name) fileInfo.exports.push(node.declaration.id.name);
        } else if (node.declaration.type === 'ClassDeclaration') {
          if (node.declaration.id?.name) fileInfo.exports.push(node.declaration.id.name);
        } else if (node.declaration.type === 'TSInterfaceDeclaration' ||
                   node.declaration.type === 'TSTypeAliasDeclaration') {
          if (node.declaration.id?.name) fileInfo.exports.push(node.declaration.id.name);
        }
      }
    });
  } catch (error) {
    console.error(`Error parsing ${relativePath}:`, error.message);
  }

  return fileInfo;
}

function findTSFiles(dir: string, exclude: string[] = []): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
        if (exclude.includes(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.d.ts')) continue;
        if (entry.name.endsWith('.ts')) files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Resolve a relative import (with .js or .ts extension, or no extension)
 * to a key in graph.files (which is keyed by `src/...` relative path).
 */
function resolveImport(fromRelPath: string, importPath: string, fromBase: 'src' | 'test'): string | null {
  if (!importPath.startsWith('.')) return null;
  const fromDir = path.dirname(fromRelPath);
  let resolved = path.posix.join(fromDir, importPath);

  // For test files importing into src/, the relative path goes through ../../src/...
  // After posix.join we get something like "../src/foo.js". Strip leading "../".
  while (resolved.startsWith('../')) {
    resolved = resolved.slice(3);
  }

  // Drop the leading "src/" if present (graph.files keys are relative to src/).
  if (resolved.startsWith('src/')) resolved = resolved.slice(4);

  // Try multiple extensions.
  const base = resolved.replace(/\.(js|ts)$/, '');
  const candidates = [resolved, base + '.ts', base + '.js', base + '/index.ts'];
  for (const c of candidates) {
    if (graph.files[c]) return c;
  }
  return null;
}

function buildFolderDependencies() {
  const folderDeps: Record<string, Set<string>> = {};
  Object.values(graph.files).forEach((file: any) => {
    const folder = path.dirname(file.path);
    if (!folderDeps[folder]) folderDeps[folder] = new Set();

    file.imports.forEach((imp: any) => {
      const resolved = resolveImport(file.path, imp.source, 'src');
      if (resolved) {
        const depFolder = path.dirname(resolved);
        if (depFolder !== folder) folderDeps[folder].add(depFolder);
      }
    });
  });

  Object.entries(folderDeps).forEach(([folder, deps]) => {
    graph.folders[folder] = Array.from(deps).sort();
  });
}

function detectLayerViolations() {
  Object.values(graph.files).forEach((file: any) => {
    file.imports.forEach((imp: any) => {
      const resolved = resolveImport(file.path, imp.source, 'src');
      if (!resolved) return;
      const target = graph.files[resolved];
      if (!target) return;
      // Violation: from < to (importing into a higher layer).
      if (file.layer < target.layer && target.layer < 99) {
        graph.layerViolations.push({
          from: file.path,
          fromLayer: file.layerName,
          to: resolved,
          toLayer: target.layerName,
          via: imp.source,
        });
      }
    });
  });
}

function buildTestCoverageMap(testFiles: ReturnType<typeof parseFile>[]) {
  testFiles.forEach(testFile => {
    testFile.imports.forEach(imp => {
      const resolved = resolveImport(testFile.path, imp.source, 'test');
      if (resolved && graph.files[resolved]) {
        if (!graph.tests[resolved]) graph.tests[resolved] = [];
        if (!graph.tests[resolved].includes(testFile.path)) {
          graph.tests[resolved].push(testFile.path);
        }
      }
    });
  });

  // Untested = src files with no test importing them, excluding the entry
  // points and shim/types modules that are intentionally just imported.
  graph.stats.untestedSrcFiles = Object.keys(graph.files)
    .filter(p => !graph.tests[p])
    .sort();
}

function calculateStats() {
  const counts = Object.values(graph.files).map((f: any) => f.imports.length);
  graph.stats.totalDependencies = counts.reduce((a, b) => a + b, 0);
  graph.stats.avgDependenciesPerFile =
    graph.stats.srcFiles > 0
      ? Number((graph.stats.totalDependencies / graph.stats.srcFiles).toFixed(2))
      : 0;

  const dependedOn: Record<string, number> = {};
  Object.values(graph.files).forEach((file: any) => {
    file.imports.forEach((imp: any) => {
      const resolved = resolveImport(file.path, imp.source, 'src');
      if (resolved) dependedOn[resolved] = (dependedOn[resolved] || 0) + 1;
    });
  });

  graph.stats.mostDependedOn = Object.entries(dependedOn)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([file, count]) => ({ file, count }));
}

function buildGraph() {
  console.log('Scanning src/ ...');
  const srcFiles = findTSFiles(SRC_DIR);
  graph.stats.srcFiles = srcFiles.length;
  srcFiles.forEach(fp => {
    const info = parseFile(fp, SRC_DIR);
    graph.files[info.path] = info;
  });
  console.log(`  Parsed ${srcFiles.length} src files`);

  console.log('Scanning test/ ...');
  const testFiles = findTSFiles(TEST_DIR);
  graph.stats.testFiles = testFiles.length;
  const testInfos = testFiles.map(fp => parseFile(fp, TEST_DIR));
  console.log(`  Parsed ${testFiles.length} test files`);

  graph.stats.totalFiles = graph.stats.srcFiles + graph.stats.testFiles;

  buildFolderDependencies();
  detectLayerViolations();
  buildTestCoverageMap(testInfos);
  calculateStats();
}

function generateJSON() {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'dependency-graph.json'),
    JSON.stringify(graph, null, 2)
  );
  console.log('Generated: dependency-graph.json');
}

function generateMarkdown() {
  let md = '# math-mcp Dependency Graph\n\n';
  md += `Generated: ${new Date().toISOString()}\n\n`;

  md += '## Statistics\n\n';
  md += `- **Source files**: ${graph.stats.srcFiles}\n`;
  md += `- **Test files**: ${graph.stats.testFiles}\n`;
  md += `- **Total dependencies (src->src imports)**: ${graph.stats.totalDependencies}\n`;
  md += `- **Average dependencies per src file**: ${graph.stats.avgDependenciesPerFile}\n`;
  md += `- **Layer violations**: ${graph.layerViolations.length}\n`;
  md += `- **Untested src files**: ${graph.stats.untestedSrcFiles.length}\n\n`;

  md += '## Layer Violations\n\n';
  if (graph.layerViolations.length === 0) {
    md += '_None._ Every import points downward through the layer stack.\n\n';
  } else {
    md += 'An import from layer N to layer M > N is a layering violation. ';
    md += 'See `STRUCTURE-AUDIT-2026-04-29.md` §2 for the full layer map.\n\n';
    md += '| From | (layer) | To | (layer) | Via |\n';
    md += '|------|---------|------|---------|-----|\n';
    graph.layerViolations.forEach(v => {
      md += `| \`${v.from}\` | ${v.fromLayer} | \`${v.to}\` | ${v.toLayer} | \`${v.via}\` |\n`;
    });
    md += '\n';
  }

  md += '## Most Depended-On src Files\n\n';
  md += '| Rank | File | Dependents |\n';
  md += '|------|------|------------|\n';
  graph.stats.mostDependedOn.forEach((item, i) => {
    md += `| ${i + 1} | \`${item.file}\` | ${item.count} |\n`;
  });
  md += '\n';

  md += '## Test Coverage Map\n\n';
  md += '| src file | layer | covered by |\n';
  md += '|----------|-------|------------|\n';
  Object.keys(graph.files).sort().forEach(p => {
    const file = graph.files[p];
    const tests = graph.tests[p] || [];
    const cov = tests.length === 0 ? '_(none)_' : tests.map(t => `\`${t}\``).join('<br>');
    md += `| \`${p}\` | ${file.layerName} | ${cov} |\n`;
  });
  md += '\n';

  if (graph.stats.untestedSrcFiles.length > 0) {
    md += '## Untested src Files\n\n';
    md += `${graph.stats.untestedSrcFiles.length} files have no test importing them:\n\n`;
    graph.stats.untestedSrcFiles.forEach(p => {
      md += `- \`${p}\`\n`;
    });
    md += '\n';
  }

  md += '## Folder Dependencies\n\n';
  Object.entries(graph.folders).sort().forEach(([folder, deps]) => {
    if ((deps as string[]).length > 0) {
      md += `### \`${folder}/\`\n\nDepends on:\n`;
      (deps as string[]).forEach(d => { md += `- \`${d}/\`\n`; });
      md += '\n';
    }
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'dependency-graph.md'), md);
  console.log('Generated: dependency-graph.md');
}

function generateMermaid() {
  let mer = 'graph TD\n';
  const topFolders = new Set<string>();
  Object.keys(graph.folders).forEach(f => topFolders.add(f.split('/')[0] || '.'));

  const topDeps: Record<string, Set<string>> = {};
  topFolders.forEach(f => { topDeps[f] = new Set(); });
  Object.entries(graph.folders).forEach(([folder, deps]) => {
    const top = folder.split('/')[0] || '.';
    (deps as string[]).forEach(d => {
      const depTop = d.split('/')[0] || '.';
      if (top !== depTop) topDeps[top].add(depTop);
    });
  });

  Object.entries(topDeps).forEach(([folder, deps]) => {
    const safe = folder.replace(/[/.-]/g, '_') || 'root';
    mer += `  ${safe}["${folder || '.'}"]\n`;
    Array.from(deps).forEach(d => {
      const safeD = d.replace(/[/.-]/g, '_') || 'root';
      mer += `  ${safe} --> ${safeD}\n`;
    });
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'dependency-graph.mermaid'), mer);
  console.log('Generated: dependency-graph.mermaid');
}

console.log('math-mcp Dependency Graph Generator\n');
buildGraph();
console.log('\nGenerating outputs...');
generateJSON();
generateMarkdown();
generateMermaid();
console.log('\nDone.');
console.log(`  Layer violations: ${graph.layerViolations.length}`);
console.log(`  Untested src files: ${graph.stats.untestedSrcFiles.length}`);
