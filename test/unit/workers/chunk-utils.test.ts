/**
 * @file chunk-utils.test.ts
 * @description Unit tests for workers/chunk-utils module
 *
 * Tests data chunking utilities for parallel processing including:
 * - Array chunking
 * - Matrix row chunking
 * - Matrix block chunking
 * - Optimal chunk count calculation
 * - Chunk merging
 * - Chunk validation
 *
 * @since 3.1.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chunkArray,
  chunkMatrixByRows,
  chunkMatrixByBlocks,
  getOptimalChunkCount,
  mergeArrayChunks,
  mergeMatrixRowChunks,
  validateChunks,
} from '../../../src/workers/chunk-utils.js';

describe('workers/chunk-utils', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('chunkArray', () => {
    it('should chunk array into equal parts', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = chunkArray(data, { numChunks: 3, minChunkSize: 1 });

      expect(chunks).toHaveLength(3);
      expect(chunks[0].data).toHaveLength(4); // 10 / 3 = 3 remainder 1
      expect(chunks[1].data).toHaveLength(3);
      expect(chunks[2].data).toHaveLength(3);
    });

    it('should assign chunk indices correctly', () => {
      const data = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(data, { numChunks: 3, minChunkSize: 1 });

      expect(chunks[0].index).toBe(0);
      expect(chunks[1].index).toBe(1);
      expect(chunks[2].index).toBe(2);
    });

    it('should set totalChunks correctly', () => {
      const data = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(data, { numChunks: 3, minChunkSize: 1 });

      chunks.forEach(chunk => {
        expect(chunk.totalChunks).toBe(3);
      });
    });

    it('should track start and end indices', () => {
      const data = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(data, { numChunks: 2, minChunkSize: 1 });

      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(3);
      expect(chunks[1].startIndex).toBe(3);
      expect(chunks[1].endIndex).toBe(6);
    });

    it('should handle arrays smaller than minChunkSize', () => {
      const data = [1, 2, 3];
      const chunks = chunkArray(data, { numChunks: 5, minChunkSize: 100 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toEqual([1, 2, 3]);
    });

    it('should handle arrays smaller than numChunks', () => {
      const data = [1, 2, 3];
      const chunks = chunkArray(data, { numChunks: 10 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toEqual([1, 2, 3]);
    });

    it('should distribute remainder across first chunks', () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 10 elements
      const chunks = chunkArray(data, { numChunks: 3, minChunkSize: 1 }); // 3 chunks: 4, 3, 3

      expect(chunks[0].data).toHaveLength(4); // Gets the extra element
      expect(chunks[1].data).toHaveLength(3);
      expect(chunks[2].data).toHaveLength(3);
    });

    it('should handle single chunk request', () => {
      const data = [1, 2, 3, 4, 5];
      const chunks = chunkArray(data, { numChunks: 1 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toEqual([1, 2, 3, 4, 5]);
    });

    it('should use default options when not specified', () => {
      const data = Array(1000).fill(1);
      const chunks = chunkArray(data);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.length).toBeLessThanOrEqual(4); // Default numChunks
    });

    it('should preserve data values', () => {
      const data = [10, 20, 30, 40, 50, 60];
      const chunks = chunkArray(data, { numChunks: 2, overlap: 0, minChunkSize: 1 });

      expect(chunks[0].data).toEqual([10, 20, 30]);
      expect(chunks[1].data).toEqual([40, 50, 60]);
    });

    it('should calculate size correctly', () => {
      const data = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(data, { numChunks: 2, minChunkSize: 1 });

      // Total sizes should equal array length
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      expect(totalSize).toBe(6);
      expect(chunks[0].size).toBe(3);
      expect(chunks[1].size).toBe(3);
    });
  });

  describe('chunkMatrixByRows', () => {
    it('should chunk matrix into row chunks', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10, 11, 12]
      ];
      const chunks = chunkMatrixByRows(matrix, { numChunks: 2 });

      expect(chunks).toHaveLength(2);
      expect(chunks[0].data).toHaveLength(2); // 2 rows
      expect(chunks[1].data).toHaveLength(2); // 2 rows
    });

    it('should preserve matrix row values', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];
      const chunks = chunkMatrixByRows(matrix, { numChunks: 2 });

      expect(chunks[0].data).toEqual([[1, 2, 3], [4, 5, 6]]);
      expect(chunks[1].data).toEqual([[7, 8, 9]]);
    });

    it('should handle matrices too small to chunk', () => {
      const matrix = [[1, 2], [3, 4]];
      const chunks = chunkMatrixByRows(matrix, { numChunks: 5 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toEqual(matrix);
    });

    it('should track row indices correctly', () => {
      const matrix = [
        [1, 2],
        [3, 4],
        [5, 6],
        [7, 8]
      ];
      const chunks = chunkMatrixByRows(matrix, { numChunks: 2 });

      expect(chunks[0].startIndex).toBe(0);
      expect(chunks[0].endIndex).toBe(2);
      expect(chunks[1].startIndex).toBe(2);
      expect(chunks[1].endIndex).toBe(4);
    });

    it('should distribute remainder rows correctly', () => {
      const matrix = Array(10).fill(0).map((_, i) => [i, i + 1]);
      const chunks = chunkMatrixByRows(matrix, { numChunks: 3 });

      expect(chunks[0].data).toHaveLength(4); // Gets extra row
      expect(chunks[1].data).toHaveLength(3);
      expect(chunks[2].data).toHaveLength(3);
    });

    it('should handle single row matrix', () => {
      const matrix = [[1, 2, 3]];
      const chunks = chunkMatrixByRows(matrix, { numChunks: 1 });

      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toEqual([[1, 2, 3]]);
    });

    it('should assign chunk metadata correctly', () => {
      const matrix = Array(6).fill(0).map(() => [1, 2]);
      const chunks = chunkMatrixByRows(matrix, { numChunks: 3 });

      chunks.forEach((chunk, i) => {
        expect(chunk.index).toBe(i);
        expect(chunk.totalChunks).toBe(3);
      });
    });
  });

  describe('chunkMatrixByBlocks', () => {
    it('should chunk matrix into blocks', () => {
      const matrix = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks).toHaveLength(4); // 2x2 blocks
    });

    it('should create blocks with correct data', () => {
      const matrix = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks[0].data).toEqual([[1, 2], [5, 6]]);
      expect(blocks[1].data).toEqual([[3, 4], [7, 8]]);
      expect(blocks[2].data).toEqual([[9, 10], [13, 14]]);
      expect(blocks[3].data).toEqual([[11, 12], [15, 16]]);
    });

    it('should track block positions', () => {
      const matrix = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks[0].blockRow).toBe(0);
      expect(blocks[0].blockCol).toBe(0);
      expect(blocks[1].blockRow).toBe(0);
      expect(blocks[1].blockCol).toBe(1);
    });

    it('should handle non-square matrices', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks.length).toBeGreaterThan(0);
    });

    it('should handle partial blocks at edges', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      // Should create 4 blocks: [0,0], [0,1], [1,0], [1,1]
      expect(blocks).toHaveLength(4);
    });

    it('should return empty array for empty matrix', () => {
      const matrix: number[][] = [];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks).toEqual([]);
    });

    it('should track start and end positions', () => {
      const matrix = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16]
      ];
      const blocks = chunkMatrixByBlocks(matrix, 2);

      expect(blocks[0].startRow).toBe(0);
      expect(blocks[0].endRow).toBe(2);
      expect(blocks[0].startCol).toBe(0);
      expect(blocks[0].endCol).toBe(2);
    });
  });

  describe('getOptimalChunkCount', () => {
    it('should return 1 for small data', () => {
      const count = getOptimalChunkCount(500, 8, 1000);
      expect(count).toBe(1);
    });

    it('should limit by maxWorkers', () => {
      const count = getOptimalChunkCount(100000, 4, 1000);
      expect(count).toBe(4);
    });

    it('should limit by data size', () => {
      const count = getOptimalChunkCount(5000, 10, 1000);
      expect(count).toBe(5); // 5000 / 1000 = 5
    });

    it('should return at least 1', () => {
      const count = getOptimalChunkCount(100, 8, 10000);
      expect(count).toBe(1);
    });

    it('should handle exact multiples', () => {
      const count = getOptimalChunkCount(8000, 8, 1000);
      expect(count).toBe(8);
    });

    it('should use default minChunkSize', () => {
      const count = getOptimalChunkCount(5000, 8);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(5);
    });

    it('should prefer fewer chunks for smaller data', () => {
      const count = getOptimalChunkCount(3000, 8, 1000);
      expect(count).toBe(3);
    });

    it('should handle very large data', () => {
      const count = getOptimalChunkCount(1000000, 8, 1000);
      expect(count).toBe(8); // Capped by maxWorkers
    });
  });

  describe('mergeArrayChunks', () => {
    it('should merge array chunks correctly', () => {
      const chunks = [
        { index: 0, totalChunks: 3, data: [1, 2, 3], startIndex: 0, endIndex: 3, size: 3 },
        { index: 1, totalChunks: 3, data: [4, 5, 6], startIndex: 3, endIndex: 6, size: 3 },
        { index: 2, totalChunks: 3, data: [7, 8, 9], startIndex: 6, endIndex: 9, size: 3 },
      ];

      const merged = mergeArrayChunks(chunks);
      expect(merged).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle single chunk', () => {
      const chunks = [
        { index: 0, totalChunks: 1, data: [1, 2, 3, 4, 5], startIndex: 0, endIndex: 5, size: 5 },
      ];

      const merged = mergeArrayChunks(chunks);
      expect(merged).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty chunk array', () => {
      const merged = mergeArrayChunks([]);
      expect(merged).toEqual([]);
    });

    it('should sort chunks by index', () => {
      const chunks = [
        { index: 2, totalChunks: 3, data: [7, 8, 9], startIndex: 6, endIndex: 9, size: 3 },
        { index: 0, totalChunks: 3, data: [1, 2, 3], startIndex: 0, endIndex: 3, size: 3 },
        { index: 1, totalChunks: 3, data: [4, 5, 6], startIndex: 3, endIndex: 6, size: 3 },
      ];

      const merged = mergeArrayChunks(chunks);
      expect(merged).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle unequal chunk sizes', () => {
      const chunks = [
        { index: 0, totalChunks: 2, data: [1, 2, 3, 4], startIndex: 0, endIndex: 4, size: 4 },
        { index: 1, totalChunks: 2, data: [5, 6], startIndex: 4, endIndex: 6, size: 2 },
      ];

      const merged = mergeArrayChunks(chunks);
      expect(merged).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  describe('mergeMatrixRowChunks', () => {
    it('should merge matrix row chunks correctly', () => {
      const chunks = [
        {
          index: 0,
          totalChunks: 2,
          data: [[1, 2], [3, 4]],
          startIndex: 0,
          endIndex: 2,
          size: 2,
        },
        {
          index: 1,
          totalChunks: 2,
          data: [[5, 6], [7, 8]],
          startIndex: 2,
          endIndex: 4,
          size: 2,
        },
      ];

      const merged = mergeMatrixRowChunks(chunks);
      expect(merged).toEqual([[1, 2], [3, 4], [5, 6], [7, 8]]);
    });

    it('should handle single chunk', () => {
      const chunks = [
        {
          index: 0,
          totalChunks: 1,
          data: [[1, 2], [3, 4]],
          startIndex: 0,
          endIndex: 2,
          size: 2,
        },
      ];

      const merged = mergeMatrixRowChunks(chunks);
      expect(merged).toEqual([[1, 2], [3, 4]]);
    });

    it('should handle empty chunk array', () => {
      const merged = mergeMatrixRowChunks([]);
      expect(merged).toEqual([]);
    });

    it('should sort chunks by index', () => {
      const chunks = [
        {
          index: 1,
          totalChunks: 2,
          data: [[5, 6]],
          startIndex: 1,
          endIndex: 2,
          size: 1,
        },
        {
          index: 0,
          totalChunks: 2,
          data: [[1, 2], [3, 4]],
          startIndex: 0,
          endIndex: 2,
          size: 2,
        },
      ];

      const merged = mergeMatrixRowChunks(chunks);
      expect(merged).toEqual([[1, 2], [3, 4], [5, 6]]);
    });
  });

  describe('validateChunks', () => {
    it('should validate correct chunks', () => {
      const chunks = [
        { index: 0, totalChunks: 3, data: [1, 2, 3], startIndex: 0, endIndex: 3, size: 3 },
        { index: 1, totalChunks: 3, data: [4, 5, 6], startIndex: 3, endIndex: 6, size: 3 },
        { index: 2, totalChunks: 3, data: [7, 8, 9], startIndex: 6, endIndex: 9, size: 3 },
      ];

      expect(() => validateChunks(chunks, 9)).not.toThrow();
      expect(validateChunks(chunks, 9)).toBe(true);
    });

    it('should throw for empty chunk array', () => {
      expect(() => validateChunks([], 10)).toThrow('No chunks to validate');
    });

    it('should throw if first chunk does not start at 0', () => {
      const chunks = [
        { index: 0, totalChunks: 1, data: [1, 2], startIndex: 1, endIndex: 3, size: 2 },
      ];

      expect(() => validateChunks(chunks, 3)).toThrow('First chunk must start at 0');
    });

    it('should throw for gaps between chunks', () => {
      const chunks = [
        { index: 0, totalChunks: 2, data: [1, 2], startIndex: 0, endIndex: 2, size: 2 },
        { index: 1, totalChunks: 2, data: [5, 6], startIndex: 3, endIndex: 5, size: 2 }, // Gap!
      ];

      expect(() => validateChunks(chunks, 5)).toThrow(/Gap or overlap/);
    });

    it('should throw for overlapping chunks', () => {
      const chunks = [
        { index: 0, totalChunks: 2, data: [1, 2, 3], startIndex: 0, endIndex: 3, size: 3 },
        { index: 1, totalChunks: 2, data: [3, 4], startIndex: 2, endIndex: 4, size: 2 }, // Overlap!
      ];

      expect(() => validateChunks(chunks, 4)).toThrow(/Gap or overlap/);
    });

    it('should throw if last chunk does not end at expected size', () => {
      const chunks = [
        { index: 0, totalChunks: 2, data: [1, 2], startIndex: 0, endIndex: 2, size: 2 },
        { index: 1, totalChunks: 2, data: [3, 4], startIndex: 2, endIndex: 4, size: 2 },
      ];

      expect(() => validateChunks(chunks, 5)).toThrow('Last chunk must end at 5');
    });

    it('should handle unordered chunks', () => {
      const chunks = [
        { index: 1, totalChunks: 2, data: [3, 4], startIndex: 2, endIndex: 4, size: 2 },
        { index: 0, totalChunks: 2, data: [1, 2], startIndex: 0, endIndex: 2, size: 2 },
      ];

      expect(() => validateChunks(chunks, 4)).not.toThrow();
    });

    it('should validate single chunk', () => {
      const chunks = [
        { index: 0, totalChunks: 1, data: [1, 2, 3, 4, 5], startIndex: 0, endIndex: 5, size: 5 },
      ];

      expect(() => validateChunks(chunks, 5)).not.toThrow();
      expect(validateChunks(chunks, 5)).toBe(true);
    });
  });
});
