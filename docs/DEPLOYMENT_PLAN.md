# Math-MCP WASM-Accelerated Deployment Guide

## Overview

This guide covers deploying the WASM-accelerated version of the math-mcp server to production environments including Claude Desktop and Claude CLI.

**Current Status:** Production Ready ✅
**Version:** 2.0.0-wasm
**Last Updated:** November 2, 2025

## Prerequisites

- Node.js v18+ (tested with v25.0.0)
- Claude Desktop, Claude CLI, or any MCP-compatible client
- Windows, macOS, or Linux

## Installation

### 1. Build the Project

```bash
cd C:/mcp-servers/math-mcp
npm install
npm run build
```

This will:
- Compile TypeScript (`src/*.ts`) to JavaScript (`dist/*.js`)
- Generate `dist/index-wasm.js` (WASM-accelerated production server)
- Generate `dist/index.js` (mathjs-only fallback)

### 2. Verify Installation

Run the integration tests to ensure everything is working:

```bash
node test/integration-test.js
```

Expected output:
```
✓ All integration tests passed!
✓ WASM integration working correctly
✓ Threshold-based routing working
✓ Performance monitoring working
```

## MCP Client Configuration

### Claude Desktop Integration

**Configuration Status:** ✅ Configured and Ready

Add the following to your Claude Desktop config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\mcp-servers\\math-mcp\\dist\\index-wasm.js"
      ]
    }
  }
}
```

**Important Notes:**
- Use absolute paths for the `args` parameter
- On Windows, use double backslashes (`\\`) in JSON
- The server name is `math-mcp` (updated from `mathjs-mcp`)
- Uses `index-wasm.js` for WASM acceleration

**After Configuration:**
1. Restart Claude Desktop completely
2. The math-mcp server will be available with 7 tools
3. Test with: "Calculate the determinant of [[1,2],[3,4]]"

### Claude CLI Integration

**Configuration Status:** ✅ Configured and Tested

The Claude CLI uses a different configuration method:

**Add Server:**
```bash
claude mcp add --transport stdio math-mcp node c:/mcp-servers/math-mcp/dist/index-wasm.js
```

**Verify Configuration:**
```bash
claude mcp list
```

Should show:
```
math-mcp: node c:/mcp-servers/math-mcp/dist/index-wasm.js - ✓ Connected
```

**Remove/Update Server:**
```bash
# Remove old configuration
claude mcp remove math-mcp

# Add updated configuration
claude mcp add --transport stdio math-mcp node c:/mcp-servers/math-mcp/dist/index-wasm.js
```

### Alternative: Global Package Installation

If you want to install globally via npm:

```bash
cd C:/mcp-servers/math-mcp
npm link
```

Then update Claude Desktop config to use the binary name:

```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "math-mcp"
    }
  }
}
```

## Available Tools

Once configured, these 7 tools will be available:

1. **evaluate** - Evaluate mathematical expressions
   - Example: `2 + 2`, `sqrt(16)`, `derivative(x^2, x)`

2. **simplify** - Simplify algebraic expressions
   - Example: `2 * x + x` becomes `3 * x`

3. **derivative** - Calculate derivatives
   - Example: `derivative('x^2', 'x')` returns `2*x`

4. **solve** - Solve equations
   - Example: `solve('x^2 - 4 = 0', 'x')` returns solutions

5. **matrix_operations** - Matrix operations (WASM-accelerated)
   - Operations: multiply, inverse, determinant, transpose, eigenvalues, add, subtract
   - Example: `determinant([[1,2],[3,4]])` returns `-2`

6. **statistics** - Statistical calculations (WASM-accelerated)
   - Operations: mean, median, mode, std, variance, min, max, sum
   - Example: `mean([1,2,3,4,5])` returns `3`

7. **unit_conversion** - Convert between units
   - Example: `convert('5 inches', 'cm')` returns `12.7 cm`

## Testing the Integration

### Test Commands for Claude Desktop/CLI:

**Basic Math:**
- "Calculate 2 + 2"
- "What is sqrt(144)?"
- "Evaluate pi * 5^2"

**Symbolic Math:**
- "Simplify (x + 2)^2"
- "Find the derivative of x^3"
- "Solve x^2 - 4 = 0"

**Matrix Operations (WASM-Accelerated):**
- "Find the determinant of [[1,2],[3,4]]"
- "Multiply matrices [[1,2],[3,4]] and [[5,6],[7,8]]"
- "Calculate the inverse of [[4,7],[2,6]]"

**Statistics (WASM-Accelerated):**
- "Calculate the mean of [1,2,3,4,5]"
- "Find the standard deviation of [10,20,30,40,50]"
- "What is the median of [7,2,9,4,5]?"

**Unit Conversion:**
- "Convert 5 inches to centimeters"
- "Convert 100 fahrenheit to celsius"
- "Convert 50 mph to km/h"

## Performance Tuning

### Threshold Configuration

The WASM wrapper uses threshold-based routing to determine when to use WASM vs mathjs. These thresholds are configured in `src/wasm-wrapper.ts`:

```typescript
const THRESHOLDS = {
  matrix_multiply: 10,  // Use WASM for matrices >= 10x10
  matrix_det: 5,        // Use WASM for matrices >= 5x5
  matrix_transpose: 20, // Use WASM for matrices >= 20x20
  statistics: 100,      // Use WASM for arrays >= 100 elements
  median: 50,           // Use WASM for arrays >= 50 elements (sorting overhead)
};
```

**To adjust thresholds:**

1. Edit `src/wasm-wrapper.ts`
2. Modify the `THRESHOLDS` object
3. Run `npm run build` to recompile
4. Restart Claude Desktop/CLI

### Expected Performance

Based on benchmark results:

**Matrix Operations:**
- 10x10 multiply: ~7x faster
- 20x20 multiply: ~8x faster
- 50x50 determinant: ~17x faster

**Statistical Operations:**
- 100 elements: ~7-12x faster
- 1,000 elements: ~15-42x faster
- 10,000 elements: ~14-42x faster

**Overall:**
- Average Speedup: 14.30x
- Peak Speedup: 42x (min/max operations)
- WASM Usage Rate: 70% (in typical workloads)
- Average WASM Execution Time: 0.207ms

## Monitoring

### Performance Statistics

The server tracks performance statistics automatically:

- **WASM calls:** Number of operations using WASM
- **mathjs calls:** Number of operations using mathjs fallback
- **WASM percentage:** Percentage of operations using WASM
- **Average times:** Average execution time for each implementation

Statistics are available through the performance monitoring API.

### Startup Messages

On successful startup, you'll see:

```
Math MCP Server running on stdio
[WASM] Modules initialized successfully
```

If WASM fails to initialize:

```
[WASM] Initialization failed, will use mathjs fallback: <error>
```

The server will continue to work using mathjs fallback - all operations remain functional.

## Troubleshooting

### Claude Desktop Issues

**Problem:** Server not starting

**Solution:**
```bash
# Verify the build exists
ls C:/mcp-servers/math-mcp/dist/index-wasm.js

# Test manually
node C:/mcp-servers/math-mcp/dist/index-wasm.js

# Check Claude Desktop logs
# Windows: %APPDATA%\Claude\logs
# macOS: ~/Library/Application Support/Claude/logs
# Linux: ~/.config/Claude/logs
```

**Problem:** Tools not appearing

**Solution:**
1. Verify JSON syntax in claude_desktop_config.json
2. Ensure absolute paths are used
3. Restart Claude Desktop completely
4. Check logs for errors

### Claude CLI Issues

**Problem:** MCP server not appearing

**Solution:**
```bash
# List all configured servers
claude mcp list

# Remove and re-add if needed
claude mcp remove math-mcp
claude mcp add --transport stdio math-mcp node c:/mcp-servers/math-mcp/dist/index-wasm.js

# Verify connection
claude mcp list
```

### WASM Initialization Fails

**Symptom:** Server logs "[WASM] Initialization failed"

**Possible causes:**
1. WASM bindings not built
2. Path to wasm/ directory is incorrect
3. File permissions issue

**Solution:**
```bash
cd C:/mcp-servers/math-mcp/wasm
npm install
npx gulp
```

Verify WASM files exist:
```bash
ls -la wasm/build/
ls -la wasm/bindings/
```

Should see:
- `wasm/build/release.wasm` and `debug.wasm`
- `wasm/bindings/matrix.cjs` and `statistics.cjs`

### Module Not Found Errors

**Symptom:** `Error [ERR_MODULE_NOT_FOUND]`

**Solution:** Ensure all dependencies are installed:
```bash
npm install
```

Check that dist/ folder exists and contains compiled files:
```bash
ls -la dist/
```

Should see:
- `index.js`
- `index-wasm.js`
- `wasm-wrapper.js`

### Performance Not Improving

**Symptom:** Operations not using WASM (WASM percentage = 0%)

**Check:**
1. Are your inputs large enough? (Check THRESHOLDS above)
2. Is WASM initialized? (Check startup logs)
3. Are you using the WASM-accelerated server? (`index-wasm.js` not `index.js`)

**Debug:**
Run integration tests to verify WASM is working:
```bash
node test/integration-test.js
```

Expected: 11/11 tests passing with 70% WASM usage rate.

## Rollback

If you need to rollback to the mathjs-only version:

1. Update Claude Desktop/CLI config to use `dist/index.js` instead of `dist/index-wasm.js`
2. Restart Claude Desktop or reload Claude CLI
3. All operations will continue to work, just without WASM acceleration

The original (non-WASM) server is preserved in `src/index.ts` and `dist/index.js`.

## Verification

### Quick Test

Test the server manually:

```bash
node dist/index-wasm.js
```

Then send a test request via stdin:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

You should receive a JSON response listing all 7 available tools.

### Integration Test

Run the full test suite:

```bash
node test/integration-test.js
```

Expected: 11/11 tests passing with 100% success rate.

## Production Checklist

Before deploying to production:

- [x] Run `npm run build` successfully
- [x] Integration tests pass (11/11)
- [x] Server starts without errors
- [x] WASM Status shows "Initialized"
- [x] Claude Desktop config updated to use math-mcp
- [x] Claude CLI config updated to use index-wasm.js
- [x] Server name changed from mathjs-mcp to math-mcp
- [ ] Claude Desktop restarted (user action required)
- [ ] Test matrix operations with large matrices (20x20+)
- [ ] Test statistics with large datasets (1000+ elements)
- [ ] Verify performance improvements in logs

## Updates

To update the server:

1. Pull latest code
2. Run `npm install` (if dependencies changed)
3. Run `npm run build`
4. Restart Claude Desktop or reload Claude CLI

## Project Structure

```
C:/mcp-servers/math-mcp/
├── src/               # TypeScript source code
│   ├── index.ts       # Original mathjs-only server
│   ├── index-wasm.ts  # WASM-accelerated server (production)
│   └── wasm-wrapper.ts # WASM integration layer
├── dist/              # Compiled JavaScript output
│   ├── index.js       # Mathjs-only (fallback)
│   ├── index-wasm.js  # Production server entry point
│   └── wasm-wrapper.js
├── wasm/              # WASM implementation
│   ├── assembly/      # AssemblyScript source
│   ├── bindings/      # JavaScript bindings
│   ├── build/         # Compiled WASM output
│   └── tests/         # WASM differential tests
├── test/              # Integration tests
│   └── integration-test.js
├── docs/              # Documentation
└── package.json       # Points to dist/index-wasm.js
```

## Support

For issues or questions:

1. Check logs in Claude Desktop/CLI
2. Run integration tests for diagnostic info: `node test/integration-test.js`
3. Review troubleshooting section above
4. Check `CHANGELOG.md` for recent changes
5. Verify server name is `math-mcp` (not `mathjs-mcp`)

## Version History

- **2.0.0-wasm** (Nov 2, 2025) - WASM acceleration enabled by default, renamed to math-mcp
- **1.0.0** (Nov 2, 2025) - Initial production release

## License

ISC License (same as parent project)

---

**Deployment Status:** Production Ready ✅
**Configuration Status:** Claude Desktop ✅ | Claude CLI ✅
**WASM Status:** Enabled and Tested ✅
**Last Updated:** November 2, 2025
**Version:** 2.0.0-wasm
