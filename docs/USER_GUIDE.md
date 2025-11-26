# Math MCP Server - User Guide

A comprehensive guide to using the Math MCP Server for mathematical computations with AI assistants.

## Table of Contents

1. [What is Math MCP Server?](#what-is-math-mcp-server)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Available Tools](#available-tools)
5. [Tool Reference](#tool-reference)
6. [Performance Features](#performance-features)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)
9. [Examples](#examples)

---

## What is Math MCP Server?

Math MCP Server is a **Model Context Protocol (MCP)** server that provides mathematical computation capabilities to AI assistants like Claude. It enables:

- **Expression evaluation** - Arithmetic, algebra, calculus
- **Symbolic math** - Simplification, derivatives, equation solving
- **Linear algebra** - Matrix operations (multiply, inverse, determinant, eigenvalues)
- **Statistics** - Mean, median, mode, standard deviation, variance
- **Unit conversion** - Convert between any compatible units

### Key Features

- **High Performance** - Up to 42x faster with WASM acceleration
- **Production Ready** - Rate limiting, health checks, Prometheus metrics
- **Secure** - Input validation, expression sandboxing, size limits
- **Zero Configuration** - Works out of the box with automatic optimization

---

## Installation

### Requirements

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Memory** >= 2GB RAM (4GB+ recommended for large operations)

### Quick Install

```bash
# Clone the repository
git clone https://github.com/danielsimonjr/math-mcp.git
cd math-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Build WASM modules
npm run build:wasm

# Generate WASM hashes (for integrity verification)
npm run generate:hashes

# Verify installation
npm test
```

### Verify Installation

```bash
# Check Node.js version
node --version  # Should show v18.0.0 or higher

# Run type check
npm run type-check

# Run tests (expect 11/11 passing)
npm test
```

Expected output:
```
✓ All integration tests passed!
✓ WASM integration working correctly
Success rate: 100.0%
```

---

## Quick Start

### Integration with Claude Desktop

Add to your Claude Desktop configuration file:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
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

### Running Standalone

```bash
# Start the server
npm start

# Or directly
node dist/index-wasm.js
```

---

## Available Tools

The server provides **7 mathematical tools**:

| Tool | Description | Acceleration |
|------|-------------|--------------|
| `evaluate` | Evaluate mathematical expressions | - |
| `simplify` | Simplify algebraic expressions | - |
| `derivative` | Calculate derivatives | - |
| `solve` | Solve equations | - |
| `matrix_operations` | Matrix operations | WASM/Workers |
| `statistics` | Statistical calculations | WASM/Workers |
| `unit_conversion` | Convert between units | - |

---

## Tool Reference

### 1. evaluate

Evaluate mathematical expressions with optional variables.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `expression` | string | Yes | Mathematical expression to evaluate |
| `scope` | object | No | Variables to use (e.g., `{x: 5, y: 10}`) |

**Examples:**
```javascript
// Basic arithmetic
evaluate("2 + 2")                        // 4
evaluate("sqrt(16)")                     // 4
evaluate("2^10")                         // 1024

// With variables
evaluate("x^2 + 2*x + 1", {x: 3})       // 16
evaluate("a * b + c", {a: 2, b: 3, c: 4}) // 10

// Complex operations
evaluate("sin(pi/2)")                    // 1
evaluate("log(e)")                       // 1
evaluate("factorial(5)")                 // 120

// Matrix operations
evaluate("det([[1,2],[3,4]])")          // -2
evaluate("transpose([[1,2],[3,4]])")    // [[1,3],[2,4]]
```

### 2. simplify

Simplify algebraic expressions.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `expression` | string | Yes | Expression to simplify |
| `rules` | array | No | Custom simplification rules |

**Examples:**
```javascript
simplify("2 * x + x")                   // "3 * x"
simplify("x^2 - x^2")                   // "0"
simplify("(x + 1) * (x - 1)")          // "x^2 - 1"
simplify("sin(x)^2 + cos(x)^2")        // "1"
simplify("x/x")                         // "1"
```

### 3. derivative

Calculate the derivative of an expression.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `expression` | string | Yes | Expression to differentiate |
| `variable` | string | Yes | Variable to differentiate with respect to |

**Examples:**
```javascript
derivative("x^2", "x")                  // "2 * x"
derivative("x^3 + 2*x^2 + x", "x")     // "3 * x^2 + 4 * x + 1"
derivative("sin(x)", "x")               // "cos(x)"
derivative("e^x", "x")                  // "e^x"
derivative("ln(x)", "x")                // "1 / x"
derivative("x * y^2", "x")              // "y^2"
derivative("x * y^2", "y")              // "2 * x * y"
```

### 4. solve

Solve equations for a variable.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `equation` | string | Yes | Equation to solve (must contain `=`) |
| `variable` | string | Yes | Variable to solve for |

**Examples:**
```javascript
solve("x + 5 = 10", "x")                // x = 5
solve("2*x - 4 = 0", "x")               // x = 2
solve("x^2 - 4 = 0", "x")               // x = 2, x = -2
solve("x^2 + 2*x + 1 = 0", "x")         // x = -1
```

### 5. matrix_operations

Perform matrix operations with WASM acceleration for large matrices.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | string | Yes | Operation: `multiply`, `inverse`, `determinant`, `transpose`, `eigenvalues`, `add`, `subtract` |
| `matrix_a` | string | Yes | First matrix in JSON format |
| `matrix_b` | string | No | Second matrix (for binary operations) |

**Operations:**

| Operation | Requires matrix_b | Description |
|-----------|-------------------|-------------|
| `multiply` | Yes | Matrix multiplication (A × B) |
| `add` | Yes | Element-wise addition (A + B) |
| `subtract` | Yes | Element-wise subtraction (A - B) |
| `inverse` | No | Matrix inverse (A⁻¹) |
| `determinant` | No | Matrix determinant |
| `transpose` | No | Matrix transpose (Aᵀ) |
| `eigenvalues` | No | Eigenvalues of matrix |

**Examples:**
```javascript
// Determinant
matrix_operations("determinant", "[[1,2],[3,4]]")
// Result: -2

// Multiplication
matrix_operations("multiply", "[[1,2],[3,4]]", "[[5,6],[7,8]]")
// Result: [[19,22],[43,50]]

// Transpose
matrix_operations("transpose", "[[1,2,3],[4,5,6]]")
// Result: [[1,4],[2,5],[3,6]]

// Inverse
matrix_operations("inverse", "[[1,2],[3,4]]")
// Result: [[-2,1],[1.5,-0.5]]

// Addition
matrix_operations("add", "[[1,2],[3,4]]", "[[5,6],[7,8]]")
// Result: [[6,8],[10,12]]

// Eigenvalues
matrix_operations("eigenvalues", "[[4,2],[1,3]]")
// Result: [5, 2]
```

**Acceleration:**
- Matrices 10×10+ use WASM (8-17x faster)
- Matrices 100×100+ use WebWorkers (32x faster)

### 6. statistics

Calculate statistical values with WASM acceleration for large datasets.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `operation` | string | Yes | Operation: `mean`, `median`, `mode`, `std`, `variance`, `min`, `max`, `sum`, `product` |
| `data` | string | Yes | Data array in JSON format |

**Operations:**

| Operation | Description |
|-----------|-------------|
| `mean` | Arithmetic mean (average) |
| `median` | Middle value |
| `mode` | Most frequent value(s) - **returns array** |
| `std` | Standard deviation |
| `variance` | Variance |
| `min` | Minimum value |
| `max` | Maximum value |
| `sum` | Sum of all values |
| `product` | Product of all values |

**Examples:**
```javascript
// Mean
statistics("mean", "[1,2,3,4,5]")
// Result: 3

// Median
statistics("median", "[1,2,3,4,5]")
// Result: 3

// Mode (returns array)
statistics("mode", "[1,2,2,3,4,4,4,5]")
// Result: [4]

// Standard deviation
statistics("std", "[2,4,4,4,5,5,7,9]")
// Result: 2

// Variance
statistics("variance", "[2,4,4,4,5,5,7,9]")
// Result: 4

// Min/Max/Sum/Product
statistics("min", "[5,2,8,1,9]")      // 1
statistics("max", "[5,2,8,1,9]")      // 9
statistics("sum", "[1,2,3,4,5]")      // 15
statistics("product", "[2,3,4]")       // 24
```

**Acceleration:**
- Arrays 100+ elements use WASM (15-42x faster)
- Arrays 100K+ elements use WebWorkers (125x faster)

### 7. unit_conversion

Convert between compatible units.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `value` | string | Yes | Value with unit (e.g., "5 inches") |
| `target_unit` | string | Yes | Target unit (e.g., "cm") |

**Supported Unit Categories:**

| Category | Example Units |
|----------|---------------|
| Length | m, cm, mm, km, in, ft, yd, mi |
| Mass | kg, g, mg, lb, oz |
| Time | s, min, h, day, week, year |
| Temperature | celsius, fahrenheit, kelvin |
| Speed | m/s, km/h, mph, knot |
| Area | m^2, cm^2, ft^2, acre, hectare |
| Volume | L, mL, m^3, gallon, cup |
| Pressure | Pa, bar, psi, atm |
| Energy | J, kJ, cal, kcal, Wh, kWh |
| Power | W, kW, hp |
| And many more... | |

**Examples:**
```javascript
// Length
unit_conversion("5 inches", "cm")           // "12.7 cm"
unit_conversion("1 mile", "km")             // "1.609344 km"
unit_conversion("100 cm", "m")              // "1 m"

// Temperature
unit_conversion("100 fahrenheit", "celsius") // "37.778 celsius"
unit_conversion("0 celsius", "kelvin")       // "273.15 kelvin"

// Speed
unit_conversion("60 mph", "km/h")           // "96.5606 km/h"
unit_conversion("100 km/h", "m/s")          // "27.778 m/s"

// Mass
unit_conversion("1 lb", "kg")               // "0.453592 kg"
unit_conversion("1 kg", "oz")               // "35.274 oz"

// Energy
unit_conversion("1 kWh", "J")               // "3600000 J"
unit_conversion("1000 cal", "kcal")         // "1 kcal"

// Compound units
unit_conversion("60 kg*m/s^2", "N")         // "60 N"
```

---

## Performance Features

### Multi-Tier Acceleration

The server automatically routes operations through the optimal tier:

| Data Size | Tier | Speedup |
|-----------|------|---------|
| Small (<10 matrices, <100 elements) | mathjs | Baseline |
| Medium (10-100 matrices, 100-100K elements) | WASM | Up to 42x |
| Large (100+ matrices, 100K+ elements) | WebWorkers | Up to 143x |

### Lazy Loading

- WASM modules load on first use (no startup overhead)
- Workers created on-demand
- Reduces cold start time

### Expression Caching

- Parsed expressions are cached (LRU cache)
- Repeated evaluations are faster
- Default cache size: 1000 entries

---

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=debug|info|warn|error    # Default: info

# Acceleration tiers
ENABLE_GPU=true                     # Default: false (not yet implemented)
ENABLE_WORKERS=true                 # Default: true
ENABLE_WASM=true                    # Default: true

# Worker pool
MIN_WORKERS=0                       # Default: 2 (0 for auto-scaling)
MAX_WORKERS=8                       # Default: CPU cores - 1
WORKER_IDLE_TIMEOUT=60000           # Default: 60000 (1 minute)
TASK_TIMEOUT=30000                  # Default: 30000 (30 seconds)

# Security limits
MAX_MATRIX_SIZE=1000                # Maximum matrix dimension
MAX_ARRAY_LENGTH=100000             # Maximum array length
MAX_EXPRESSION_LENGTH=10000         # Maximum expression length

# Performance
ENABLE_PERF_LOGGING=true            # Log performance stats periodically
DISABLE_PERF_TRACKING=true          # Disable for minimal overhead
```

### Running with Custom Configuration

```bash
# Debug mode with performance logging
LOG_LEVEL=debug ENABLE_PERF_LOGGING=true node dist/index-wasm.js

# Minimal memory usage (auto-scaling workers)
MIN_WORKERS=0 MAX_WORKERS=2 node dist/index-wasm.js

# High throughput configuration
MIN_WORKERS=4 MAX_WORKERS=16 node dist/index-wasm.js
```

---

## Troubleshooting

### WASM Not Loading

**Symptoms:**
```
[WARN] WASM not initialized, falling back to mathjs
```

**Solutions:**
1. Rebuild WASM modules:
   ```bash
   cd wasm && npm install && npm run asbuild && cd ..
   ```
2. Regenerate hashes:
   ```bash
   npm run generate:hashes
   ```

### Workers Not Starting

**Symptoms:**
```
[ERROR] Worker threads not supported
```

**Solutions:**
1. Verify Node.js version: `node --version` (must be >= 18)
2. Check if `worker_threads` module is available

### Performance Issues

**Symptoms:** Operations slower than expected

**Solutions:**
1. Verify using `index-wasm.js` (not `index.js`)
2. Check input sizes exceed acceleration thresholds
3. Enable performance logging:
   ```bash
   ENABLE_PERF_LOGGING=true node dist/index-wasm.js
   ```

### Memory Issues

**Symptoms:**
```
JavaScript heap out of memory
```

**Solutions:**
1. Increase Node.js memory:
   ```bash
   node --max-old-space-size=4096 dist/index-wasm.js
   ```
2. Reduce worker count:
   ```bash
   MAX_WORKERS=2 node dist/index-wasm.js
   ```

---

## Examples

### Scientific Calculator

```javascript
// Trigonometry
evaluate("sin(pi/4)")                    // 0.7071...
evaluate("cos(pi/3)")                    // 0.5
evaluate("tan(pi/4)")                    // 1

// Logarithms
evaluate("log(100, 10)")                 // 2
evaluate("ln(e^5)")                      // 5
evaluate("log2(256)")                    // 8

// Complex expressions
evaluate("sqrt(3^2 + 4^2)")              // 5
evaluate("(1 + sqrt(5)) / 2")            // 1.618... (golden ratio)
```

### Calculus

```javascript
// Derivatives
derivative("x^3 - 3*x^2 + 2*x - 1", "x") // "3*x^2 - 6*x + 2"

// Finding critical points
solve("3*x^2 - 6*x + 2 = 0", "x")        // x = 1 ± sqrt(3)/3
```

### Linear Algebra

```javascript
// System of equations via matrices
// [2x + 3y = 8]
// [4x + 5y = 14]
// Solution: x = A^(-1) * b

matrix_operations("inverse", "[[2,3],[4,5]]")
// [[-2.5, 1.5], [2, -1]]

matrix_operations("multiply", "[[-2.5,1.5],[2,-1]]", "[[8],[14]]")
// [[1], [2]] -> x=1, y=2
```

### Data Analysis

```javascript
// Dataset statistics
const data = "[23,45,67,89,12,34,56,78,90,11]";

statistics("mean", data)      // 50.5
statistics("median", data)    // 50.5
statistics("std", data)       // 28.6...
statistics("min", data)       // 11
statistics("max", data)       // 90
```

### Physics Calculations

```javascript
// Kinetic energy: E = 0.5 * m * v^2
evaluate("0.5 * 10 * 20^2", {})          // 2000 J

// Unit conversions
unit_conversion("2000 J", "kJ")           // "2 kJ"
unit_conversion("72 km/h", "m/s")         // "20 m/s"

// Force: F = m * a
evaluate("10 * 9.8", {})                  // 98 N
unit_conversion("98 N", "lbf")            // "22.03 lbf"
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
- [../README.md](../README.md) - Project overview
- [../CHANGELOG.md](../CHANGELOG.md) - Version history
- [ACCELERATION_ARCHITECTURE.md](ACCELERATION_ARCHITECTURE.md) - Performance details
