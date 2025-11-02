# Math-MCP Product Specification

## Product Overview

**Name:** math-mcp
**Type:** Model Context Protocol (MCP) Server
**Version:** 2.0.0-wasm
**Status:** Production Ready ✅
**Last Updated:** November 2, 2025

Math-MCP is a WASM-accelerated mathematical computation server that provides high-performance mathematical operations to Large Language Models through the Model Context Protocol. It offers seamless integration with Claude Desktop and Claude CLI, delivering up to 42x performance improvement for large-scale computations.

## Core Architecture

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Protocol Layer                       │
│  (index-wasm.ts - Production Server)                        │
│  - Request handling (JSON-RPC 2.0)                          │
│  - Tool registration & dispatch                              │
│  - Response formatting                                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│              WASM Wrapper Layer                              │
│  (wasm-wrapper.ts - Intelligent Routing)                    │
│  - Threshold-based WASM/mathjs selection                    │
│  - Automatic fallback on WASM failure                        │
│  - Performance metrics tracking                              │
│  - Size-based optimization decisions                         │
└──────────────┬──────────────────────┬───────────────────────┘
               │                       │
    ┌──────────▼──────────┐   ┌───────▼────────────┐
    │   WASM Layer         │   │  MathJS Layer      │
    │  (AssemblyScript)    │   │  (JavaScript)      │
    │  - Matrix ops        │   │  - All operations  │
    │  - Statistics        │   │  - Fallback        │
    │  - 14-42x faster     │   │  - Compatibility   │
    └──────────────────────┘   └────────────────────┘
```

### Design Philosophy

**Wrapper Pattern Instead of Fork:**
Unlike the original plan to clone and modify mathjs, the implemented solution uses a lightweight wrapper pattern that:
- Keeps mathjs dependency unchanged
- Adds WASM acceleration as an optional performance layer
- Maintains 100% API compatibility
- Provides automatic fallback to pure JavaScript
- Enables independent WASM module updates

## Product Features

### 7 Mathematical Tools

#### 1. **evaluate** - Expression Evaluation
- **Purpose:** Evaluate mathematical expressions with variables
- **Acceleration:** Partial (delegates to other tools)
- **Examples:**
  - `2 + 2` → `4`
  - `sqrt(144)` → `12`
  - `pi * 5^2` → `78.54`
  - `derivative(x^2, x)` → `2*x`
- **Input:** Expression string, optional scope object
- **Output:** Computed result (formatted)

#### 2. **simplify** - Algebraic Simplification
- **Purpose:** Simplify algebraic expressions symbolically
- **Acceleration:** No (pure mathjs)
- **Examples:**
  - `2 * x + x` → `3 * x`
  - `(x + 2)^2` → `x^2 + 4*x + 4`
- **Input:** Expression string, optional rules array
- **Output:** Simplified expression string

#### 3. **derivative** - Calculus Derivatives
- **Purpose:** Calculate symbolic derivatives
- **Acceleration:** No (pure mathjs)
- **Examples:**
  - `derivative('x^2', 'x')` → `2*x`
  - `derivative('sin(x)', 'x')` → `cos(x)`
- **Input:** Expression string, variable name
- **Output:** Derivative expression string

#### 4. **solve** - Equation Solving
- **Purpose:** Solve equations for variables
- **Acceleration:** No (pure mathjs)
- **Examples:**
  - `solve('x^2 - 4 = 0', 'x')` → Solutions
  - `solve('2x + 1 = 5', 'x')` → `x = 2`
- **Input:** Equation string, variable name
- **Output:** Simplified equation or solutions

#### 5. **matrix_operations** - Matrix Operations
- **Purpose:** High-performance matrix computations
- **Acceleration:** ✅ WASM (7-17x faster for large matrices)
- **Operations:**
  - `multiply` - Matrix multiplication (WASM ≥10×10)
  - `inverse` - Matrix inversion
  - `determinant` - Determinant calculation (WASM ≥5×5)
  - `transpose` - Matrix transposition (WASM ≥20×20)
  - `eigenvalues` - Eigenvalue computation
  - `add` - Matrix addition
  - `subtract` - Matrix subtraction
- **Input:** Operation name, matrix_a (JSON), optional matrix_b
- **Output:** Computed matrix or scalar result

#### 6. **statistics** - Statistical Analysis
- **Purpose:** High-performance statistical computations
- **Acceleration:** ✅ WASM (15-42x faster for large datasets)
- **Operations:**
  - `mean` - Average (WASM ≥100 elements)
  - `median` - Middle value (WASM ≥50 elements)
  - `mode` - Most frequent value
  - `std` - Standard deviation (WASM ≥100 elements)
  - `variance` - Variance (WASM ≥100 elements)
  - `min` - Minimum value (WASM ≥100 elements)
  - `max` - Maximum value (WASM ≥100 elements)
  - `sum` - Sum of all values (WASM ≥100 elements)
- **Input:** Operation name, data array (JSON)
- **Output:** Computed statistical value

#### 7. **unit_conversion** - Unit Conversions
- **Purpose:** Convert between measurement units
- **Acceleration:** No (pure mathjs)
- **Examples:**
  - `('5 inches', 'cm')` → `12.7 cm`
  - `('100 fahrenheit', 'celsius')` → `37.78 celsius`
  - `('50 mph', 'km/h')` → `80.47 km/h`
- **Input:** Value with unit string, target unit string
- **Output:** Converted value with unit

### WASM Acceleration System

#### Threshold-Based Routing

The system automatically selects the optimal computation method based on input size:

```typescript
const THRESHOLDS = {
  matrix_multiply: 10,    // Use WASM for matrices ≥10×10
  matrix_det: 5,          // Use WASM for matrices ≥5×5
  matrix_transpose: 20,   // Use WASM for matrices ≥20×20
  statistics: 100,        // Use WASM for arrays ≥100 elements
  median: 50,             // Use WASM for arrays ≥50 elements (sorting overhead)
};
```

**Decision Logic:**
1. Check input size against threshold
2. Verify WASM is initialized
3. If both true → Use WASM
4. Otherwise → Use mathjs
5. If WASM fails → Automatic fallback to mathjs

#### Performance Characteristics

**Achieved Benchmarks (Production):**

| Operation | Small Input | Large Input | Speedup | WASM Usage |
|-----------|-------------|-------------|---------|------------|
| Matrix Multiply (10×10) | mathjs | WASM | 7x | 70% |
| Matrix Multiply (20×20) | mathjs | WASM | 8x | 70% |
| Matrix Det (50×50) | mathjs | WASM | 17x | 70% |
| Statistics Mean (100) | mathjs | WASM | 7-12x | 70% |
| Statistics Mean (1000) | mathjs | WASM | 15-42x | 70% |
| Statistics Min (1000) | mathjs | WASM | 42x | 70% |
| Statistics Max (1000) | mathjs | WASM | 42x | 70% |

**Overall Metrics:**
- Average Speedup: **14.30x**
- Peak Speedup: **42x** (min/max operations)
- WASM Usage Rate: **70%** (typical workloads)
- Average WASM Execution Time: **0.207ms**

#### Automatic Fallback

Every WASM operation includes automatic fallback:

```typescript
try {
  if (useWASM && wasmModule) {
    result = wasmModule.operation(data);
    perfCounters.wasmCalls++;
    return result;
  }
} catch (error) {
  console.error('[WASM] Operation failed, falling back to mathjs:', error);
}

// Fallback to mathjs
result = math.operation(data);
perfCounters.mathjsCalls++;
return result;
```

## Technical Implementation

### Project Structure

```
C:/mcp-servers/math-mcp/
├── src/                          # TypeScript source
│   ├── index.ts                  # MathJS-only server (legacy)
│   ├── index-wasm.ts             # WASM-accelerated server (PRODUCTION)
│   └── wasm-wrapper.ts           # WASM integration layer
│
├── dist/                         # Compiled JavaScript
│   ├── index.js                  # Compiled legacy server
│   ├── index-wasm.js             # Compiled production server ⭐
│   └── wasm-wrapper.js           # Compiled wrapper
│
├── wasm/                         # WASM implementation
│   ├── assembly/                 # AssemblyScript source
│   │   ├── matrix/               # Matrix operations
│   │   │   ├── multiply.ts
│   │   │   ├── determinant.ts
│   │   │   └── transpose.ts
│   │   └── statistics/           # Statistical operations
│   │       ├── mean.ts
│   │       ├── median.ts
│   │       ├── variance.ts
│   │       └── minmax.ts
│   │
│   ├── bindings/                 # JavaScript ↔ WASM bridge
│   │   ├── matrix.cjs            # Matrix bindings
│   │   └── statistics.cjs        # Statistics bindings
│   │
│   ├── build/                    # Compiled WASM modules
│   │   ├── release.wasm          # Production WASM
│   │   └── debug.wasm            # Development WASM
│   │
│   ├── tests/                    # Differential testing
│   │   ├── differential-matrix.cjs
│   │   └── differential-statistics.cjs
│   │
│   └── benchmarks/               # Performance benchmarks
│       ├── profile-matrix.js
│       └── profile-stats.js
│
├── test/                         # Integration tests
│   └── integration-test.js       # End-to-end MCP tests
│
├── docs/                         # Documentation
│   ├── DEPLOYMENT_PLAN.md        # Production deployment guide
│   ├── IMPLEMENTATION_PLAN.md    # Development plan
│   ├── PRODUCT_SPECIFICATION.md  # This document
│   ├── REFACTORING_PLAN.md       # Refactoring history
│   ├── STYLE_GUIDE.md            # Code style guide
│   └── TEST_VERIFICATION_PLAN.md # Testing strategy
│
├── CHANGELOG.md                  # Complete project history
├── README.md                     # Main documentation
├── package.json                  # Dependencies & scripts
└── tsconfig.json                 # TypeScript configuration
```

### Dependencies

**Production:**
- `@modelcontextprotocol/sdk` ^1.20.2 - MCP protocol implementation
- `mathjs` ^15.0.0 - Mathematical operations library

**Development:**
- `typescript` ^5.9.3 - TypeScript compiler
- `@types/node` ^24.9.1 - Node.js type definitions
- AssemblyScript (in wasm/) - WASM compilation

**WASM Build Tools:**
- `assemblyscript` - Compile TypeScript to WASM
- `gulp` - Build automation (in wasm/)

### Build Process

**Standard Build:**
```bash
npm run build
# Compiles: src/*.ts → dist/*.js
```

**WASM Build (if needed):**
```bash
cd wasm
npm install
npx gulp
# Compiles: assembly/*.ts → build/*.wasm
```

**Entry Points:**
- Main: `dist/index-wasm.js` (production)
- Fallback: `dist/index.js` (legacy)
- Binary: `math-mcp` (via npm link)

## MCP Protocol Implementation

### JSON-RPC 2.0 Interface

**Server Information:**
- Name: `math-mcp`
- Version: `2.0.0-wasm`
- Protocol: Model Context Protocol v1.20.2

**Supported Methods:**
- `tools/list` - List available tools
- `tools/call` - Execute a tool

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "matrix_operations",
    "arguments": {
      "operation": "determinant",
      "matrix_a": "[[1,2],[3,4]]"
    }
  }
}
```

**Response Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"result\": \"-2\"}"
      }
    ]
  }
}
```

**Error Handling:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"error\": \"Error message\"}"
      }
    ],
    "isError": true
  }
}
```

### Transport

**Protocol:** Standard I/O (stdio)
- Input: stdin (JSON-RPC requests)
- Output: stdout (JSON-RPC responses)
- Logging: stderr (status messages, errors)

**Initialization:**
```javascript
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Integration Points

### Claude Desktop

**Configuration File:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**
```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\mcp-servers\\math-mcp\\dist\\index-wasm.js"]
    }
  }
}
```

**Integration Status:** ✅ Configured and Ready

### Claude CLI

**Configuration Method:** Command-line interface

**Setup:**
```bash
claude mcp add --transport stdio math-mcp node c:/mcp-servers/math-mcp/dist/index-wasm.js
```

**Verification:**
```bash
claude mcp list
# Output: math-mcp: node c:/mcp-servers/math-mcp/dist/index-wasm.js - ✓ Connected
```

**Integration Status:** ✅ Configured and Tested

### Other MCP Clients

Any MCP-compatible client can integrate by:
1. Spawning Node.js process: `node /path/to/dist/index-wasm.js`
2. Communicating via stdio with JSON-RPC 2.0
3. Using standard MCP protocol for tool discovery and execution

## Quality Assurance

### Testing Strategy

**1. Integration Tests (11 tests, 100% passing):**
- WASM initialization verification
- Small matrix operations (mathjs fallback)
- Large matrix operations (WASM acceleration)
- Small statistics operations (mathjs fallback)
- Large statistics operations (WASM acceleration)
- Threshold-based routing verification
- Performance monitoring validation

**2. Differential Tests:**
- WASM results must exactly match mathjs results
- Floating-point precision validation
- Edge case handling (empty arrays, singular matrices)

**3. Performance Benchmarks:**
- Matrix operations: 10×10, 20×20, 50×50
- Statistics: 100, 1,000, 10,000 elements
- WASM vs mathjs comparison
- Speedup verification

**4. MCP Protocol Tests:**
- Request/response format validation
- Error handling verification
- All 7 tools functional testing

### Success Criteria (All Met ✅)

- ✅ Integration tests: 11/11 passing (100%)
- ✅ Matrix operations: 7-17x speedup (target: 5-10x)
- ✅ Statistical operations: 15-42x speedup (target: 2-5x)
- ✅ WASM usage rate: 70% (target: >50%)
- ✅ MCP server works without errors
- ✅ WASM fallback mechanisms work correctly
- ✅ Claude Desktop integration successful
- ✅ Claude CLI integration successful

## Performance Monitoring

### Built-in Metrics

The server tracks performance in real-time:

```typescript
interface PerfStats {
  wasmCalls: number;          // Total WASM operations
  mathjsCalls: number;        // Total mathjs operations
  totalCalls: number;         // Combined total
  wasmPercentage: string;     // "70.0%"
  avgWasmTime: string;        // "0.207ms"
  avgMathjsTime: string;      // "1.178ms"
  wasmInitialized: boolean;   // true/false
}
```

**Access via:**
```typescript
import { getPerfStats } from './wasm-wrapper.js';
const stats = getPerfStats();
```

### Logging

**Startup Messages:**
```
Math MCP Server running on stdio
[WASM] Modules initialized successfully
```

**Initialization Failure:**
```
[WASM] Initialization failed, will use mathjs fallback: <error>
```

**Operation Failures:**
```
[WASM] Matrix multiply failed, falling back to mathjs: <error>
```

## Deployment Requirements

### System Requirements

**Node.js:**
- Version: 18.0.0 or higher
- Tested on: v25.0.0
- Required for: JavaScript runtime and WASM execution

**Operating Systems:**
- Windows 10/11 (tested)
- macOS 10.15+ (compatible)
- Linux (Ubuntu 20.04+, compatible)

**Memory:**
- Minimum: 512 MB RAM
- Recommended: 1 GB RAM (for large matrix operations)

**Disk Space:**
- Installation: ~50 MB
- WASM modules: ~2 MB
- Dependencies: ~100 MB (node_modules)

### Installation Requirements

**Required:**
- Node.js and npm installed
- Write access to installation directory
- Network access for npm install

**Optional:**
- Global npm link capability (for binary installation)
- Claude Desktop or Claude CLI

## Product Versioning

### Version History

**2.0.0-wasm** (November 2, 2025) - Current
- Server renamed from mathjs-mcp to math-mcp
- WASM acceleration enabled by default
- Updated package.json to use index-wasm.js
- Claude Desktop and CLI configurations updated
- Production ready status achieved

**1.0.0** (November 2, 2025)
- Initial production release
- Project refactored to root-level structure
- 11/11 integration tests passing
- Complete documentation

**Development Phases** (October-November 2025)
- Phase 1: Planning and foundation
- Phase 2: WASM implementation
- Phase 3: Integration and testing
- Phase 4: Production deployment

### Semantic Versioning

Format: `MAJOR.MINOR.PATCH-wasm`

- MAJOR: Breaking changes to MCP interface
- MINOR: New features, tool additions
- PATCH: Bug fixes, performance improvements
- -wasm: Indicates WASM-accelerated version

## Product Roadmap

### Current Status (2.0.0-wasm)

✅ All features implemented and tested
✅ Production deployment complete
✅ Documentation complete
✅ Integration with Claude Desktop and CLI

### Potential Future Enhancements

**Performance Optimizations:**
- Additional WASM operations (eigenvalues, SVD)
- Lower thresholds for faster small operations
- Parallel WASM execution for batch operations
- WebAssembly SIMD optimizations

**Feature Additions:**
- Symbolic integration (currently only derivatives)
- Linear programming solver
- Polynomial root finding
- Complex number operations
- Vector calculus operations

**Developer Experience:**
- Interactive configuration UI
- Performance profiling dashboard
- Real-time operation monitoring
- Custom threshold configuration

**Integration:**
- Support for more MCP clients
- Streaming results for long computations
- Caching for repeated calculations
- Distributed computation support

## Support and Maintenance

### Build Commands

```bash
# Standard build
npm run build

# Development mode (watch + run)
npm run dev

# Start production server
npm start

# Run integration tests
node test/integration-test.js

# Rebuild WASM modules
cd wasm && npx gulp
```

### Troubleshooting

**Common Issues:**

1. **WASM not initializing**
   - Check wasm/build/ directory exists
   - Verify wasm bindings are present
   - Rebuild WASM: `cd wasm && npx gulp`

2. **Performance not improving**
   - Verify using index-wasm.js not index.js
   - Check input sizes meet thresholds
   - Review WASM initialization logs

3. **Integration test failures**
   - Rebuild project: `npm run build`
   - Check Node.js version: `node --version`
   - Review test output for specific failures

### Support Channels

**Documentation:**
- README.md - Quick start guide
- DEPLOYMENT_PLAN.md - Deployment instructions
- CHANGELOG.md - Complete project history
- This file - Complete product specification

**Diagnostic Commands:**
```bash
# Verify installation
node dist/index-wasm.js
# Should start and wait for JSON-RPC input

# Run tests
node test/integration-test.js
# Should show 11/11 passing

# Check MCP integration
claude mcp list
# Should show math-mcp as connected
```

## License and Attribution

**License:** ISC License

**Dependencies:**
- mathjs (Apache-2.0)
- @modelcontextprotocol/sdk (MIT)
- TypeScript (Apache-2.0)
- AssemblyScript (Apache-2.0)

---

**Product Status:** Production Ready ✅
**Deployment Status:** Claude Desktop ✅ | Claude CLI ✅
**WASM Status:** Enabled and Tested ✅
**Documentation Status:** Complete ✅
**Last Updated:** November 2, 2025
**Version:** 2.0.0-wasm
