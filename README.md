# Math MCP Server

[![CI](https://github.com/danielsimonjr/math-mcp/workflows/CI/badge.svg)](https://github.com/danielsimonjr/math-mcp/actions)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

A high-performance MCP (Model Context Protocol) server providing mathematical computation capabilities powered by mathjs, with **WebAssembly (WASM) acceleration** for performance-critical operations.

## 🚀 Performance

This server features WebAssembly acceleration providing **up to 42x speedup** compared to pure JavaScript:

- **Matrix Operations:** 7-17x faster for large matrices (10x10+)
- **Statistical Operations:** 15-42x faster for large datasets (100+ elements)
- **Automatic Optimization:** Transparent threshold-based routing between WASM and mathjs
- **Zero Breaking Changes:** 100% backward compatible API

### Performance Results

| Operation | Size | Speedup |
|-----------|------|---------|
| Matrix Multiply | 20x20 | 8.0x |
| Matrix Determinant | 50x50 | 17.4x |
| Statistics (Mean) | 1,000 elements | 15.5x |
| Statistics (Min/Max) | 1,000 elements | 41-42x |
| Statistics (Variance) | 1,000 elements | 35.6x |

**Average Speedup**: 14.30x | **Peak Speedup**: 42x | **WASM Usage**: 70%

For detailed benchmarks, see [CHANGELOG.md](CHANGELOG.md).

## ✨ Features

### 7 Mathematical Tools

1. **evaluate** - Evaluate mathematical expressions with variables
2. **simplify** - Simplify algebraic expressions
3. **derivative** - Calculate derivatives
4. **solve** - Solve equations
5. **matrix_operations** ⚡ - Matrix operations (WASM-accelerated)
6. **statistics** ⚡ - Statistical calculations (WASM-accelerated)
7. **unit_conversion** - Convert between units

⚡ = WASM-accelerated for large inputs

### Example Usage

```javascript
// Matrix operations (WASM-accelerated for 10x10+)
matrix_operations("determinant", "[[1,2],[3,4]]")  // -2

// Statistics (WASM-accelerated for 100+ elements)
statistics("mean", "[1,2,3,4,5]")  // 3

// Symbolic math
derivative("x^2", "x")  // "2 * x"
simplify("2 * x + x")   // "3 * x"

// Unit conversion
unit_conversion("5 inches", "cm")  // "12.7 cm"
```

## 📦 Installation

### Quick Start

```bash
# Clone the repository
git clone https://github.com/danielsimonjr/math-mcp.git
cd math-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Build WASM modules
cd wasm && npm install && npx gulp && cd ..

# Run tests
npm test
```

### Integration with Claude Desktop

Add to your Claude Desktop config file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "node",
      "args": ["C:/path/to/math-mcp/dist/index-wasm.js"]
    }
  }
}
```

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "math-mcp": {
      "command": "node",
      "args": ["/path/to/math-mcp/dist/index-wasm.js"]
    }
  }
}
```

Restart Claude Desktop and start using math tools!

### Integration with Claude CLI

```bash
claude mcp add --transport stdio math-mcp node /path/to/math-mcp/dist/index-wasm.js
```

## 🧮 Tools Documentation

### 1. evaluate

Evaluate mathematical expressions with optional variables.

**Parameters:**
- `expression` (string): Mathematical expression to evaluate
- `scope` (object, optional): Variables to use in the expression

**Examples:**
```javascript
evaluate("2 + 2")                    // 4
evaluate("sqrt(16)")                 // 4
evaluate("x^2 + 2*x", {x: 5})       // 35
evaluate("derivative(x^2, x)")       // "2 * x"
```

### 2. simplify

Simplify mathematical expressions.

**Parameters:**
- `expression` (string): Expression to simplify

**Examples:**
```javascript
simplify("2 * x + x")               // "3 * x"
simplify("(x + 2)^2")               // "x^2 + 4*x + 4"
```

### 3. derivative

Calculate derivatives of expressions.

**Parameters:**
- `expression` (string): Expression to differentiate
- `variable` (string): Variable to differentiate with respect to

**Examples:**
```javascript
derivative("x^2", "x")              // "2 * x"
derivative("sin(x)", "x")           // "cos(x)"
```

### 4. solve

Solve equations.

**Parameters:**
- `equation` (string): Equation to solve
- `variable` (string): Variable to solve for

**Examples:**
```javascript
solve("x^2 - 4 = 0", "x")           // Solutions for x
solve("2*x + 3 = 7", "x")           // x = 2
```

### 5. matrix_operations (WASM-Accelerated ⚡)

Perform matrix operations with WASM acceleration for large matrices.

**Parameters:**
- `operation` (string): Operation to perform
  - `multiply`, `inverse`, `determinant`, `transpose`, `eigenvalues`, `add`, `subtract`
- `matrix_a` (string): First matrix in JSON format
- `matrix_b` (string, optional): Second matrix (for binary operations)

**WASM Thresholds:**
- multiply: 10x10+ (8x speedup)
- determinant: 5x5+ (17x speedup)
- transpose: 20x20+ (2x speedup)
- **add, subtract: 20x20+ (3-5x speedup)** ⚡ NEW

**Examples:**
```javascript
matrix_operations("determinant", "[[1,2],[3,4]]")           // -2
matrix_operations("multiply", "[[1,2],[3,4]]", "[[5,6],[7,8]]")  // [[19,22],[43,50]]
matrix_operations("transpose", "[[1,2,3],[4,5,6]]")         // [[1,4],[2,5],[3,6]]
matrix_operations("add", "[[1,2],[3,4]]", "[[5,6],[7,8]]")      // [[6,8],[10,12]]
matrix_operations("subtract", "[[5,6],[7,8]]", "[[1,2],[3,4]]") // [[4,4],[4,4]]
```

### 6. statistics (WASM-Accelerated ⚡)

Calculate statistical values with WASM acceleration for large datasets.

**Parameters:**
- `operation` (string): Statistical operation
  - `mean`, `median`, `mode`, `std`, `variance`, `min`, `max`, `sum`, `product`
- `data` (string): Data array in JSON format

**WASM Thresholds:**
- mean, std, variance, min, max, sum: 100+ elements (15-42x speedup)
- median: 50+ elements
- **mode, product: 100+ elements (10-20x speedup)** ⚡ NEW

**Examples:**
```javascript
statistics("mean", "[1,2,3,4,5]")               // 3
statistics("std", "[2,4,4,4,5,5,7,9]")          // 2
statistics("median", "[1,2,3,4,5]")             // 3
statistics("mode", "[1,2,2,3,4,4,4,5]")         // 4
statistics("product", "[2,3,4]")                // 24
```

### 7. unit_conversion

Convert between units.

**Parameters:**
- `value` (string): Value with unit (e.g., "5 inches")
- `target_unit` (string): Target unit (e.g., "cm")

**Examples:**
```javascript
unit_conversion("5 inches", "cm")               // "12.7 cm"
unit_conversion("100 fahrenheit", "celsius")    // "37.78 celsius"
unit_conversion("50 mph", "km/h")               // "80.47 km/h"
```

## 🔧 How WASM Acceleration Works

The server automatically chooses between WASM and mathjs based on operation size:

**Small Operations** (Below threshold)
- Use mathjs (pure JavaScript)
- Avoid WASM initialization overhead
- Still fast for small data

**Large Operations** (Above threshold)
- Use WASM automatically
- Significant performance gains (5-42x)
- Transparent to users

**Graceful Fallback**
- If WASM fails, automatically uses mathjs
- No user interruption
- Server continues working normally

## 📊 Architecture

```
MCP Server (index-wasm.ts)
    ↓
WASM Wrapper (wasm-wrapper.ts)
    ├→ WASM Modules (large inputs)
    │   ├─ wasm/assembly/matrix.ts
    │   └─ wasm/assembly/statistics.ts
    └→ mathjs (small inputs & symbolic)
```

**Wrapper Pattern Benefits:**
- No mathjs fork to maintain
- Easy mathjs updates
- Clean separation of concerns
- Intelligent routing
- Automatic fallback

## 📁 Project Structure

```
math-mcp/
├── src/
│   ├── index.ts              # Original mathjs-only server
│   ├── index-wasm.ts         # WASM-accelerated server (production)
│   └── wasm-wrapper.ts       # WASM integration layer
├── wasm/
│   ├── assembly/             # AssemblyScript source
│   │   ├── matrix.ts
│   │   └── statistics.ts
│   ├── bindings/             # JavaScript bindings
│   ├── build/                # Compiled WASM
│   ├── tests/                # WASM tests
│   └── benchmarks/           # Performance benchmarks
├── test/
│   └── integration-test.js   # Integration tests (11/11 passing)
├── dist/                     # Compiled JavaScript
├── docs/                     # Documentation
│   ├── BUILD_GUIDE.md
│   ├── DEPLOYMENT_PLAN.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── PRODUCT_SPECIFICATION.md
│   ├── STYLE_GUIDE.md
│   ├── TEST_GUIDE.md
│   └── TEST_VERIFICATION_PLAN.md
├── .github/
│   ├── workflows/ci.yml
│   └── ISSUE_TEMPLATE/
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
└── package.json
```

## 🧪 Development

```bash
# Build TypeScript
npm run build

# Build WASM modules
npm run build:wasm

# Build everything
npm run build:all

# Run tests
npm test

# Run server
npm start

# Development mode
npm run dev
```

## 📚 Documentation

- **[BUILD_GUIDE.md](docs/BUILD_GUIDE.md)** - Build and compilation guide
- **[DEPLOYMENT_PLAN.md](docs/DEPLOYMENT_PLAN.md)** - Production deployment instructions
- **[IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)** - Implementation strategy and architecture
- **[PRODUCT_SPECIFICATION.md](docs/PRODUCT_SPECIFICATION.md)** - Complete product specification
- **[STYLE_GUIDE.md](docs/STYLE_GUIDE.md)** - Coding standards and conventions
- **[TEST_GUIDE.md](docs/TEST_GUIDE.md)** - Testing procedures and guidelines
- **[TEST_VERIFICATION_PLAN.md](docs/TEST_VERIFICATION_PLAN.md)** - Test verification strategy
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines
- **[SECURITY.md](SECURITY.md)** - Security policy

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Quick Contribution Guide

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 🔒 Security

See [SECURITY.md](SECURITY.md) for security policy and vulnerability reporting.

## 🐛 Troubleshooting

### WASM Not Initializing

Check server startup logs:
```
MathJS MCP Server (WASM-accelerated) running on stdio
WASM Status: Initialized  ← Should see this
```

If you see "Fallback to mathjs":
```bash
cd wasm
npm install
npx gulp
```

### Performance Not Improving

1. Check input sizes - WASM only activates above thresholds
2. Verify WASM initialized (check logs)
3. Confirm using `index-wasm.js` not `index.js`

### Integration Tests Failing

```bash
npm install
npm run build:all
npm test
```

Expected: **11/11 tests passing**

## 📝 Version History

- **2.0.1** (November 5, 2025) - Extended WASM coverage: matrix add/subtract, statistics mode/product
- **2.0.0** (November 2, 2025) - WASM acceleration, 14.30x average speedup
- **1.0.0** - Initial mathjs-only version

## 📄 License

ISC License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **mathjs** - Excellent JavaScript math library
- **AssemblyScript** - TypeScript-to-WASM compiler
- **MCP SDK** - Model Context Protocol implementation

---

**Status:** Production Ready ✅
**Performance:** Up to 42x faster with WASM acceleration
**Platform Support:** Windows | macOS | Linux
**Node.js:** ≥18.0.0

Made with ❤️ by the math-mcp contributors
