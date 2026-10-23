<!-- repo-map:no-verification -->
<!-- GENERATED FILE -- do not edit by hand.
     Regenerate with `repo-tools map`. -->

# Test Coverage Analysis

## Summary

| Metric | Count |
|--------|-------|
| Total Source Files | 16 |
| Total Test Files | 15 |
| Source Files with Tests | 11 |
| Source Files without Tests | 5 |
| Coverage (raw, direct-import) | **68.8%** |
---

## Source Files Without Test Coverage

The following 5 source files are not directly imported by any test file:

### root/

- `src/index.ts`
- `src/math-engine.ts`
- `src/register-tools.ts`
- `src/types.ts`

### telemetry/

- `src/telemetry/server.ts`

---

## Source Files With Test Coverage

| Source File | Test Files |
|-------------|------------|
| `src/errors.ts` | `dos.test.ts`, `errors.test.ts`, `handler-utils.test.ts`, `rate-limiter.test.ts`, `utils.test.ts`, `validation.test.ts` |
| `src/expression-cache.ts` | `expression-cache.test.ts` |
| `src/handler-utils.ts` | `bounds.test.ts`, `dos.test.ts`, `fuzzing.test.ts`, `injection.test.ts`, `handler-utils.test.ts`, `solver.test.ts` |
| `src/health.ts` | `health.test.ts` |
| `src/rate-limiter.ts` | `dos.test.ts`, `rate-limiter.test.ts` |
| `shared/constants.ts` | `constants.test.ts` |
| `shared/logger.ts` | `dos.test.ts`, `logger.test.ts`, `utils.test.ts` |
| `telemetry/metrics.ts` | `metrics.test.ts` |
| `src/tool-handlers.ts` | `bounds.test.ts`, `dos.test.ts`, `fuzzing.test.ts`, `injection.test.ts`, `solver.test.ts` |
| `src/utils.ts` | `dos.test.ts`, `utils.test.ts` |
| `src/validation.ts` | `validation.test.ts` |

---

## Test File Details

| Test File | Imports from Source |
|-----------|---------------------|
| `security/bounds.test.ts` | 2 files |
| `security/dos.test.ts` | 6 files |
| `security/fuzzing.test.ts` | 2 files |
| `security/injection.test.ts` | 2 files |
| `unit/errors.test.ts` | 1 files |
| `unit/expression-cache.test.ts` | 1 files |
| `unit/handler-utils.test.ts` | 2 files |
| `unit/health.test.ts` | 1 files |
| `unit/rate-limiter.test.ts` | 2 files |
| `shared/constants.test.ts` | 1 files |
| `shared/logger.test.ts` | 1 files |
| `unit/solver.test.ts` | 2 files |
| `telemetry/metrics.test.ts` | 1 files |
| `unit/utils.test.ts` | 3 files |
| `unit/validation.test.ts` | 2 files |
