# Security Policy

## Supported Versions

Currently supported versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 4.x     | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in math-mcp, please report it responsibly:

### How to Report

1. **Do NOT** open a public GitHub issue
2. Email security details to: [your-security-email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Status Updates**: Weekly until resolved
- **Fix Timeline**: Depends on severity
  - Critical: Within 7 days
  - High: Within 30 days
  - Medium/Low: Next release cycle

### Disclosure Policy

- We request 90 days before public disclosure
- We will credit you in the security advisory (unless you prefer anonymity)
- We will notify you before publishing the fix

## Security Considerations

### Input Validation

All MCP tool inputs are validated:
- Type checking for all parameters
- Size limits on arrays/matrices
- Sanitization of mathematical expressions
- Protection against malicious inputs

### Dependencies

- Regular dependency updates via Dependabot
- Audit dependencies with `npm audit`
- Pin dependencies to specific versions
- Monitor security advisories

### Known Limitations

1. **Expression Evaluation**: Uses MathTS's `evaluate()` (a mathjs-compatible API) which can execute arbitrary mathematical expressions. While safe for math operations, be cautious with user input in production environments.

2. **Memory Limits**: Operations on very large datasets (>100MB) may cause memory issues. Size limits (`MAX_MATRIX_SIZE`, `MAX_ARRAY_LENGTH`) are enforced in `src/validation.ts`.

3. **Denial of Service**: Complex expressions or very large matrices could cause CPU exhaustion. Because evaluation is synchronous JS (no WASM/worker offload), it cannot be interrupted mid-computation — protection relies on:
   - Input size limits
   - Rate limiting
   - Resource quotas

## Best Practices

When deploying math-mcp in production:

### 1. Input Sanitization

```typescript
// Validate matrix sizes
if (rows > MAX_MATRIX_SIZE || cols > MAX_MATRIX_SIZE) {
  throw new Error('Matrix size exceeds limit');
}

// Validate array lengths
if (data.length > MAX_ARRAY_LENGTH) {
  throw new Error('Array length exceeds limit');
}
```

### 2. Timeout Protection

```typescript
// Implement operation timeouts
const timeout = setTimeout(() => {
  throw new Error('Operation timeout');
}, MAX_EXECUTION_TIME);

try {
  const result = performOperation();
  clearTimeout(timeout);
  return result;
} catch (error) {
  clearTimeout(timeout);
  throw error;
}
```

### 3. Resource Monitoring

- Monitor memory usage
- Set CPU limits
- Implement request rate limiting
- Log suspicious activity

### 4. Environment Security

- Run with minimal privileges
- Use process isolation
- Implement network restrictions
- Regular security updates

## Audit History

- **2025-11-02**: Initial security policy created
- No security vulnerabilities reported to date

## Security Features

### Expression Sandboxing

Mathematical expressions are validated before evaluation (`src/validation.ts`):
- AST-based validation / sanitization of expressions
- Size limits on expressions, arrays, and matrices (`MAX_MATRIX_SIZE`, `MAX_ARRAY_LENGTH`)
- Token-bucket rate limiting (`src/rate-limiter.ts`) to bound request volume

### Error Handling

All errors are caught and logged:
- Invalid inputs return error messages
- No sensitive information in error messages
- Stack traces sanitized in production

### Dependency Security

- MathTS (`@danielsimonjr/mathts-compat`, mathjs-compatible API): actively maintained
- @modelcontextprotocol/sdk: Official MCP SDK
- Regular security audits

## Contact

For security concerns:
- Email: [your-security-email]
- PGP Key: [if available]

## Acknowledgments

We thank security researchers who responsibly disclose vulnerabilities. Contributors will be acknowledged here unless they prefer anonymity.

---

Last Updated: November 2, 2025
