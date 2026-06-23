/**
 * @file math-engine.ts
 * @description Single MathTS compute surface (replaces the former mathjs shim).
 *
 * `@danielsimonjr/mathts-compat` exposes `create(all)` to build a
 * mathjs-API-compatible instance (the same surface the codebase used from
 * mathjs: evaluate/parse/simplify/derivative/format/unit, matrix ops, and
 * statistics). This is the one place the engine is constructed; every other
 * module imports the default export.
 */
import { create, all, type MathInstance } from '@danielsimonjr/mathts-compat';

// compat's MathInstance types the explicit shim members but leaves the spread
// functions-package members (evaluate/simplify/derivative/format/median/…) as
// unknown. Surface them as callable — the math API is dynamic by nature (mathjs's
// own types were equally loose). Explicit MathInstance members keep their types.
type MathEngine = MathInstance & {
  // The math API is dynamic and returns values whose type depends on input
  // (mathjs typed these as `any` too). Surface untyped members as callable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [name: string]: (...args: any[]) => any;
};

const math = create(all) as unknown as MathEngine;

export default math;
