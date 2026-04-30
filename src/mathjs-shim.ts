/**
 * @file mathjs-shim.ts
 * @description Single import surface for mathjs.
 *
 * The local fork at file:../Mathjs ships an ESM bundle whose only top-level
 * export is `default` (the configured math instance), while its `types/index.d.ts`
 * declares only named exports. `import math from 'mathjs'` fails type-checking
 * (no default in types); `import * as math from 'mathjs'` returns
 * `{ default: instance }` at runtime under Node16 resolution. This shim
 * resolves the runtime/type mismatch in one place.
 */
import * as mathNamespace from 'mathjs';

const resolved =
  (mathNamespace as unknown as { default?: typeof mathNamespace }).default ??
  mathNamespace;

const math = resolved as typeof mathNamespace;

export default math;
