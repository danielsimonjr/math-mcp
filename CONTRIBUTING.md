# Contributing to math-mcp

Thank you for your interest in contributing to math-mcp! This document provides guidelines and instructions for contributing.

## Code of Conduct

This project follows a standard code of conduct. Please be respectful and professional in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/math-mcp.git
   cd math-mcp
   ```
3. **Install dependencies**:
   ```bash
   npm install
   cd wasm && npm install && cd ..
   ```
4. **Build the project**:
   ```bash
   npm run build
   cd wasm && npx gulp && cd ..
   ```
5. **Run tests**:
   ```bash
   node test/integration-test.js
   ```

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `perf/description` - Performance improvements
- `wasm/description` - WASM-related changes

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the style guide (see docs/STYLE_GUIDE.md)

3. **Test your changes**:
   ```bash
   npm run build
   node test/integration-test.js
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   Follow conventional commits format:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `perf:` - Performance improvements
   - `test:` - Test changes
   - `chore:` - Build/tooling changes

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub

## Code Style

This project follows strict TypeScript and AssemblyScript style guidelines. Please see:

- **TypeScript Style**: See docs/STYLE_GUIDE.md
- **AssemblyScript Style**: See docs/STYLE_GUIDE.md
- **Naming Conventions**: camelCase for variables/functions, PascalCase for types

### TypeScript

```typescript
// Good
export function calculateMean(data: number[]): number {
  const sum = data.reduce((a, b) => a + b, 0);
  return sum / data.length;
}

// Bad
export function calc_mean(data: any): any {
  let s = 0;
  for(let i=0;i<data.length;i++) s+=data[i];
  return s/data.length;
}
```

### AssemblyScript

```typescript
// Good
export function mean(data: Float64Array, length: i32): f64 {
  let sum: f64 = 0.0;
  for (let i: i32 = 0; i < length; i++) {
    sum += unchecked(data[i]);
  }
  return sum / <f64>length;
}
```

## Testing

### Integration Tests

Run the full integration test suite:

```bash
node test/integration-test.js
```

Expected output: **11/11 tests passing**

### WASM Differential Tests

If you modify WASM modules, run differential tests:

```bash
cd wasm/tests
node differential-test.js
```

### Performance Benchmarks

If your changes affect performance:

```bash
cd wasm/benchmarks
node profile-matrix.js
node profile-statistics.js
```

Include benchmark results in your PR.

## Adding New Features

### Adding a New MCP Tool

1. **Define the tool** in `src/index-wasm.ts`:
   ```typescript
   server.setRequestHandler(ListToolsRequestSchema, async () => ({
     tools: [
       // ... existing tools
       {
         name: "your_tool",
         description: "Description of what it does",
         inputSchema: {
           type: "object",
           properties: {
             param: { type: "string", description: "Parameter description" }
           },
           required: ["param"]
         }
       }
     ]
   }));
   ```

2. **Implement the handler**:
   ```typescript
   case "your_tool": {
     const { param } = args as { param: string };
     const result = yourImplementation(param);
     return {
       content: [{ type: "text", text: JSON.stringify({ result }) }]
     };
   }
   ```

3. **Add tests** in `test/integration-test.js`

4. **Update documentation**:
   - README.md (features section)
   - docs/PRODUCT_SPECIFICATION.md

### Adding WASM-Accelerated Operations

1. **Implement in AssemblyScript** (`wasm/assembly/your-module.ts`):
   ```typescript
   export function yourOperation(data: Float64Array, length: i32): f64 {
     // Implementation
   }
   ```

2. **Add JavaScript bindings** (`wasm/bindings/your-module.cjs`)

3. **Integrate in wrapper** (`src/wasm-wrapper.ts`):
   - Add threshold configuration
   - Implement routing logic
   - Add fallback handling

4. **Add differential tests**:
   ```typescript
   // Compare WASM vs mathjs results
   ```

5. **Benchmark performance**:
   - Measure speedup
   - Tune threshold
   - Document results

## Documentation

When adding features or making changes:

- **Update README.md** if user-facing changes
- **Update docs/PRODUCT_SPECIFICATION.md** for API changes
- **Update docs/BUILD_GUIDE.md** if build process changes
- **Update docs/DEPLOYMENT_PLAN.md** if deployment changes
- **Add to CHANGELOG.md** following keep-a-changelog format

## Performance Guidelines

### When to Use WASM

WASM acceleration is beneficial when:
- Operation has O(n²) or O(n³) complexity
- Input size is large (≥ threshold)
- Operation is purely numerical (no symbolic math)

### Threshold Tuning

When adding WASM-accelerated operations:

1. **Benchmark** WASM vs mathjs at various input sizes
2. **Find crossover point** where WASM becomes faster
3. **Set threshold** slightly above crossover
4. **Document** rationale in code comments

### Performance Targets

- WASM should be ≥5x faster than mathjs above threshold
- No regression below threshold
- Overhead should be minimal (<1ms)

## Pull Request Process

1. **Ensure CI passes** - All tests must pass on all platforms
2. **Update documentation** - Keep docs in sync with code
3. **Add tests** - New features need test coverage
4. **Benchmark if needed** - Performance changes need benchmarks
5. **Follow conventional commits** - Clean, descriptive commit messages
6. **Request review** - Assign reviewers if you know who should review

### PR Checklist

Before submitting:

- [ ] Code follows style guide
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No performance regression
- [ ] TypeScript compiles without errors
- [ ] WASM builds successfully (if applicable)

## Getting Help

- **Questions?** Open a discussion on GitHub
- **Bugs?** File an issue with bug report template
- **Feature ideas?** Open an issue with feature request template

## Attribution

Contributors will be recognized in:
- GitHub contributors page
- CHANGELOG.md (for significant contributions)
- README.md (for major features)

Thank you for contributing to math-mcp! 🎉
