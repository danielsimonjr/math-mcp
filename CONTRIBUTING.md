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
   bun install
   ```
4. **Build the project**:
   ```bash
   bun run build
   ```
5. **Run tests**:
   ```bash
   bun run test
   ```

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `perf/description` - Performance improvements

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the style guide (see docs/STYLE_GUIDE.md)

3. **Test your changes**:
   ```bash
   bun run build
   bun run test
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

This project follows strict TypeScript style guidelines. Please see:

- **TypeScript Style**: See docs/STYLE_GUIDE.md
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

## Testing

### Integration Tests

Run the full integration test suite:

```bash
bun run test
```

Also run `bun run test:unit` (Vitest unit tests) and `bun run test:security`
(security test suite) — see `bun run test:all` for the full set.

## Adding New Features

### Adding a New MCP Tool

1. **Define the tool** in `src/index.ts`:
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

2. **Implement the handler** in `src/tool-handlers.ts`:
   ```typescript
   export async function handleYourTool(args: { param: string }) {
     const result = yourImplementation(args.param);
     return {
       content: [{ type: "text", text: JSON.stringify({ result }) }]
     };
   }
   ```

3. **Add tests** in `test/integration-test.js`

4. **Update documentation**:
   - README.md (features section)
   - docs/PRODUCT_SPECIFICATION.md

## Documentation

When adding features or making changes:

- **Update README.md** if user-facing changes
- **Update docs/PRODUCT_SPECIFICATION.md** for API changes
- **Update docs/BUILD_GUIDE.md** if build process changes
- **Add to CHANGELOG.md** following keep-a-changelog format

## Pull Request Process

1. **Ensure CI passes** - All tests must pass on all platforms
2. **Update documentation** - Keep docs in sync with code
3. **Add tests** - New features need test coverage
4. **Follow conventional commits** - Clean, descriptive commit messages
5. **Request review** - Assign reviewers if you know who should review

### PR Checklist

Before submitting:

- [ ] Code follows style guide
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] No performance regression
- [ ] TypeScript compiles without errors

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
