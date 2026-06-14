/**
 * @file wasm-integrity.test.ts
 * @description Unit tests for WASM hash-manifest verification.
 *
 * Verifies the security boundary that gates WASM module loading.
 * Tests use mocked fs/crypto so no real WASM files need to be present.
 *
 * @since 3.5.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
}));

const cryptoMock = vi.hoisted(() => ({
  createHash: vi.fn(),
}));

vi.mock('fs/promises', () => fsMock);
vi.mock('crypto', () => cryptoMock);

import { verifyWasmIntegrity, isIntegrityCheckEnabled } from '../../src/wasm-integrity.js';
import { WasmError } from '../../src/errors.js';

const VALID_MANIFEST = {
  version: 1,
  generated: '2026-04-29T00:00:00Z',
  hashes: {
    'wasm/build/release.wasm': {
      sha256: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222',
      algorithm: 'sha256',
      timestamp: '2026-04-29T00:00:00Z',
    },
  },
};

function setHashOutput(hex: string): void {
  cryptoMock.createHash.mockReturnValue({
    update: vi.fn(),
    digest: vi.fn().mockReturnValue(hex),
  });
}

describe('wasm-integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level manifest cache by re-importing — but the
    // simpler trick is to make readFile return the manifest text on
    // each test, accepting that the cache persists across tests in the
    // same describe block. This is fine because all tests use the same
    // manifest content.
  });

  describe('isIntegrityCheckEnabled', () => {
    it('returns true by default', () => {
      delete process.env.DISABLE_WASM_INTEGRITY_CHECK;
      expect(isIntegrityCheckEnabled()).toBe(true);
    });

    it('returns false when DISABLE_WASM_INTEGRITY_CHECK=true', () => {
      process.env.DISABLE_WASM_INTEGRITY_CHECK = 'true';
      expect(isIntegrityCheckEnabled()).toBe(false);
      delete process.env.DISABLE_WASM_INTEGRITY_CHECK;
    });

    it('treats non-true values as enabled', () => {
      process.env.DISABLE_WASM_INTEGRITY_CHECK = '1';
      expect(isIntegrityCheckEnabled()).toBe(true);
      process.env.DISABLE_WASM_INTEGRITY_CHECK = 'false';
      expect(isIntegrityCheckEnabled()).toBe(true);
      delete process.env.DISABLE_WASM_INTEGRITY_CHECK;
    });
  });

  describe('verifyWasmIntegrity', () => {
    it('returns true when actual hash matches the manifest', async () => {
      fsMock.readFile
        .mockResolvedValueOnce(JSON.stringify(VALID_MANIFEST))   // manifest
        .mockResolvedValueOnce(Buffer.from('wasm-bytes'));       // file content
      setHashOutput(VALID_MANIFEST.hashes['wasm/build/release.wasm'].sha256);

      const r = await verifyWasmIntegrity(
        '/abs/wasm/build/release.wasm',
        'wasm/build/release.wasm'
      );
      expect(r).toBe(true);
    });

    it('throws WasmError when actual hash differs from manifest', async () => {
      fsMock.readFile
        .mockResolvedValueOnce(JSON.stringify(VALID_MANIFEST))
        .mockResolvedValueOnce(Buffer.from('tampered'));
      setHashOutput('deadbeef'.repeat(8));

      await expect(
        verifyWasmIntegrity('/abs/wasm/build/release.wasm', 'wasm/build/release.wasm')
      ).rejects.toThrow(WasmError);
      await expect(
        verifyWasmIntegrity('/abs/wasm/build/release.wasm', 'wasm/build/release.wasm')
      ).rejects.toThrow(/integrity verification failed/);
    });

    it('throws WasmError when the path is absent from the manifest', async () => {
      fsMock.readFile.mockResolvedValueOnce(JSON.stringify(VALID_MANIFEST));

      await expect(
        verifyWasmIntegrity('/abs/wasm/build/missing.wasm', 'wasm/build/missing.wasm')
      ).rejects.toThrow(/not found in integrity manifest/);
    });

    it('wraps lower-level fs errors in WasmError', async () => {
      // Force loadManifest to fail by making readFile reject the first call.
      // But our test fixture cached a valid manifest above — we can no
      // longer cleanly reset the cache without re-importing the module.
      // Instead, exercise the file-content read failure path.
      fsMock.readFile
        .mockResolvedValueOnce(JSON.stringify(VALID_MANIFEST))
        .mockRejectedValueOnce(new Error('ENOENT'));

      await expect(
        verifyWasmIntegrity('/missing.wasm', 'wasm/build/release.wasm')
      ).rejects.toThrow(WasmError);
    });
  });
});
