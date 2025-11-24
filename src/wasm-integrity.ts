/**
 * @file wasm-integrity.ts
 * @description WASM module integrity verification
 *
 * Provides cryptographic verification of WASM binaries before loading
 * to prevent execution of tampered or malicious modules.
 *
 * Security features:
 * - SHA-256 hash verification against known-good manifest
 * - Fail-safe: Blocks loading if verification fails
 * - Detailed logging of verification attempts
 *
 * @module wasm-integrity
 * @since 3.1.0
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WasmError } from './errors.js';
import { logger } from './utils.js';

/**
 * Hash manifest structure
 */
interface HashManifest {
  version: number;
  generated: string;
  hashes: Record<string, {
    sha256: string;
    algorithm: string;
    timestamp: string;
  }>;
}

/**
 * Cached hash manifest
 */
let manifestCache: HashManifest | null = null;

/**
 * Loads the WASM hash manifest
 *
 * @returns {Promise<HashManifest>} The hash manifest
 * @throws {WasmError} If manifest cannot be loaded
 */
async function loadManifest(): Promise<HashManifest> {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const manifestPath = join(__dirname, '../wasm-hashes.json');

    logger.debug('Loading WASM hash manifest', { path: manifestPath });

    const content = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content) as HashManifest;

    if (!manifest.version || !manifest.hashes) {
      throw new Error('Invalid manifest structure');
    }

    manifestCache = manifest;
    logger.debug('Hash manifest loaded', {
      version: manifest.version,
      hashCount: Object.keys(manifest.hashes).length,
      generated: manifest.generated,
    });

    return manifest;
  } catch (error) {
    throw new WasmError(
      'Failed to load WASM hash manifest',
      { cause: error }
    );
  }
}

/**
 * Computes SHA-256 hash of a file
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  const hash = createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

/**
 * Verifies the integrity of a WASM file
 *
 * @param {string} filePath - Absolute path to WASM file
 * @param {string} relativePath - Relative path (as stored in manifest)
 * @returns {Promise<boolean>} True if verification succeeds
 * @throws {WasmError} If verification fails or file is tampered
 *
 * @example
 * ```typescript
 * await verifyWasmIntegrity(
 *   '/home/user/math-mcp/wasm/build/release.wasm',
 *   'wasm/build/release.wasm'
 * );
 * ```
 */
export async function verifyWasmIntegrity(
  filePath: string,
  relativePath: string
): Promise<boolean> {
  try {
    logger.debug('Verifying WASM integrity', { path: relativePath });

    // Load manifest
    const manifest = await loadManifest();

    // Check if file is in manifest
    const expectedHash = manifest.hashes[relativePath];
    if (!expectedHash) {
      throw new WasmError(
        `WASM file not found in integrity manifest: ${relativePath}`
      );
    }

    // Compute actual hash
    const actualHash = await computeFileHash(filePath);

    // Verify hash matches
    if (actualHash !== expectedHash.sha256) {
      logger.error('WASM integrity verification FAILED', {
        path: relativePath,
        expected: expectedHash.sha256,
        actual: actualHash,
      });

      throw new WasmError(
        `WASM integrity verification failed for ${relativePath}. ` +
        'The file may have been tampered with or corrupted. ' +
        'Please rebuild WASM modules with "npm run build:wasm" and regenerate hashes.'
      );
    }

    logger.debug('WASM integrity verified', {
      path: relativePath,
      hash: actualHash.substring(0, 16) + '...',
    });

    return true;
  } catch (error) {
    if (error instanceof WasmError) {
      throw error;
    }

    throw new WasmError(
      `Failed to verify WASM integrity for ${relativePath}`,
      { cause: error }
    );
  }
}

/**
 * Checks if integrity verification is enabled
 *
 * Can be disabled via DISABLE_WASM_INTEGRITY_CHECK environment variable.
 * Not recommended for production use.
 *
 * @returns {boolean} True if verification is enabled
 */
export function isIntegrityCheckEnabled(): boolean {
  return process.env.DISABLE_WASM_INTEGRITY_CHECK !== 'true';
}

/**
 * Verifies all WASM modules in the manifest
 *
 * @returns {Promise<void>} Resolves if all verifications succeed
 * @throws {WasmError} If any verification fails
 */
export async function verifyAllWasmModules(): Promise<void> {
  if (!isIntegrityCheckEnabled()) {
    logger.warn('WASM integrity verification is DISABLED');
    return;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const projectRoot = join(__dirname, '..');

  const manifest = await loadManifest();
  const paths = Object.keys(manifest.hashes);

  logger.info('Verifying WASM module integrity', { count: paths.length });

  for (const relativePath of paths) {
    const absolutePath = join(projectRoot, relativePath);
    await verifyWasmIntegrity(absolutePath, relativePath);
  }

  logger.info('All WASM modules verified successfully', { count: paths.length });
}
