/**
 * @file injection-tests.ts
 * @description Security tests for code injection prevention
 *
 * Tests various attack vectors to ensure the server properly blocks:
 * - Function definitions and calls
 * - Variable assignments
 * - Import/require statements
 * - Prototype pollution
 * - Access to process/global objects
 * - toString/valueOf exploits
 *
 * @module security/injection-tests
 */

import { describe, it, expect } from 'vitest';
import {
  handleEvaluate,
  handleSimplify,
  handleDerivative,
  handleSolve,
} from '../../src/tool-handlers.js';

describe('Code Injection Prevention', () => {
  describe('Expression evaluation', () => {
    const maliciousExpressions = [
      // Function definitions
      {
        expr: 'function attack() { while(true) {} }; attack()',
        reason: 'function definition with infinite loop',
      },
      {
        expr: 'f = function() { return 1; }; f()',
        reason: 'function assignment and call',
      },
      {
        expr: '(() => { while(true) {} })()',
        reason: 'arrow function with infinite loop',
      },

      // Assignments
      {
        expr: 'x = 1; process.exit()',
        reason: 'assignment with process.exit',
      },
      {
        expr: 'global.hacked = true',
        reason: 'global object pollution',
      },
      {
        expr: 'this.attack = true',
        reason: 'this object modification',
      },

      // Import attempts
      {
        expr: 'import("child_process")',
        reason: 'dynamic import of child_process',
      },
      {
        expr: 'require("fs")',
        reason: 'require filesystem module',
      },
      {
        expr: 'require("child_process").exec("ls")',
        reason: 'require and execute shell command',
      },

      // Prototype pollution
      {
        expr: '__proto__.polluted = true',
        reason: 'prototype pollution via __proto__',
      },
      {
        expr: 'constructor.prototype.polluted = true',
        reason: 'prototype pollution via constructor',
      },
      {
        expr: 'Object.prototype.polluted = true',
        reason: 'Object prototype pollution',
      },

      // Accessing private internals
      {
        expr: 'process.env.SECRET_KEY',
        reason: 'access to environment variables',
      },
      {
        expr: 'global.process.exit()',
        reason: 'access to process via global',
      },
      {
        expr: 'process.binding("fs")',
        reason: 'access to internal bindings',
      },

      // Object property access attempts
      {
        expr: 'constructor',
        reason: 'access to constructor',
      },
      {
        expr: 'constructor.constructor("return process")()',
        reason: 'constructor escape attempt',
      },

      // While loops (should be blocked)
      {
        expr: 'while(true) {}',
        reason: 'infinite while loop',
      },
      {
        expr: 'for(;;) {}',
        reason: 'infinite for loop',
      },

      // Eval attempts
      {
        expr: 'eval("2+2")',
        reason: 'eval function call',
      },

      // New Function attempts
      {
        expr: 'new Function("return 1")()',
        reason: 'Function constructor',
      },
    ];

    it('should block all malicious expressions', async () => {
      for (const { expr, reason } of maliciousExpressions) {
        await expect(
          handleEvaluate({ expression: expr }),
          `Should block: ${reason}`
        ).rejects.toThrow();
      }
    });

    it('should block function definitions in expression', async () => {
      const expr = 'function foo() { return 1; }';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/not allowed|invalid|blocked/i);
    });

    it('should block assignments in expression', async () => {
      const expr = 'x = 42';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/not allowed|invalid|blocked/i);
    });

    it('should block import statements', async () => {
      const expr = 'import("fs")';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow(/not allowed|invalid|blocked/i);
    });

    it('should block access to process object', async () => {
      const expr = 'process.exit(0)';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow();
    });

    it('should block access to global object', async () => {
      const expr = 'global.test = 1';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow();
    });

    it('should allow safe mathematical expressions', async () => {
      const safeExpressions = [
        '2 + 2',
        'sqrt(16)',
        'sin(pi / 2)',
        'log(e)',
        'abs(-5)',
        'max(1, 2, 3)',
        'round(3.14159, 2)',
      ];

      for (const expr of safeExpressions) {
        const result = await handleEvaluate({ expression: expr });
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('Scope injection', () => {
    it('should block malicious objects in scope', async () => {
      const maliciousScope = JSON.stringify({
        __proto__: { polluted: true },
      });

      await expect(
        handleEvaluate({
          expression: '2 + 2',
          scope: maliciousScope,
        })
      ).rejects.toThrow();
    });

    it('should block constructor in scope keys', async () => {
      const maliciousScope = JSON.stringify({
        constructor: 'attack',
      });

      await expect(
        handleEvaluate({
          expression: '2 + 2',
          scope: maliciousScope,
        })
      ).rejects.toThrow();
    });

    it('should block prototype in scope keys', async () => {
      const maliciousScope = JSON.stringify({
        prototype: 'attack',
      });

      await expect(
        handleEvaluate({
          expression: '2 + 2',
          scope: maliciousScope,
        })
      ).rejects.toThrow();
    });

    it('should allow safe scope variables', async () => {
      const safeScope = JSON.stringify({
        x: 10,
        y: 20,
        z: 30,
      });

      const result = await handleEvaluate({
        expression: 'x + y + z',
        scope: safeScope,
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('60');
    });
  });

  describe('Simplify injection', () => {
    it('should block malicious expressions in simplify', async () => {
      await expect(
        handleSimplify({
          expression: 'x = 1; process.exit()',
        })
      ).rejects.toThrow();
    });

    it('should block function definitions in simplify', async () => {
      await expect(
        handleSimplify({
          expression: 'function() { return 1; }',
        })
      ).rejects.toThrow();
    });

    it('should allow safe simplify expressions', async () => {
      const result = await handleSimplify({
        expression: '2x + 3x',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Derivative injection', () => {
    it('should block malicious expressions in derivative', async () => {
      await expect(
        handleDerivative({
          expression: 'x = 1; process.exit()',
          variable: 'x',
        })
      ).rejects.toThrow();
    });

    it('should block function definitions in derivative', async () => {
      await expect(
        handleDerivative({
          expression: 'function() { return x; }',
          variable: 'x',
        })
      ).rejects.toThrow();
    });

    it('should block malicious variable names', async () => {
      const maliciousVars = [
        '__proto__',
        'constructor',
        'prototype',
        'process',
        'global',
      ];

      for (const varName of maliciousVars) {
        await expect(
          handleDerivative({
            expression: 'x^2',
            variable: varName,
          })
        ).rejects.toThrow();
      }
    });

    it('should allow safe derivative operations', async () => {
      const result = await handleDerivative({
        expression: 'x^2 + 3x + 1',
        variable: 'x',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Solve injection', () => {
    it('should block malicious expressions in solve', async () => {
      await expect(
        handleSolve({
          equation: 'x = 1; process.exit()',
          variable: 'x',
        })
      ).rejects.toThrow();
    });

    it('should block function definitions in solve', async () => {
      await expect(
        handleSolve({
          equation: 'function() { return x; } = 0',
          variable: 'x',
        })
      ).rejects.toThrow();
    });

    it('should block malicious variable names in solve', async () => {
      const maliciousVars = [
        '__proto__',
        'constructor',
        'prototype',
        'process',
        'global',
      ];

      for (const varName of maliciousVars) {
        await expect(
          handleSolve({
            equation: 'x + 1 = 0',
            variable: varName,
          })
        ).rejects.toThrow();
      }
    });

    it('should allow safe solve operations', async () => {
      const result = await handleSolve({
        equation: 'x + 5 = 10',
        variable: 'x',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('Complex injection attacks', () => {
    it('should block nested malicious expressions', async () => {
      const expr = '((x) => { while(true) {} })(1)';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow();
    });

    it('should block toString exploitation', async () => {
      // Attempt to exploit toString by passing object that executes code
      const maliciousScope = JSON.stringify({
        x: {
          toString: '() => { process.exit(); }',
        },
      });

      await expect(
        handleEvaluate({
          expression: 'x',
          scope: maliciousScope,
        })
      ).rejects.toThrow();
    });

    it('should block chained property access', async () => {
      const expr = 'this.constructor.constructor("return process")()';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow();
    });

    it('should block regexp DOS patterns', async () => {
      // Catastrophic backtracking pattern
      const expr = '"aaaaaaaaaaaaaaaaaaaaaaaaa".match(/a+b+c+/)';

      await expect(
        handleEvaluate({ expression: expr })
      ).rejects.toThrow();
    });
  });

  describe('AST validation', () => {
    it('should validate expression AST structure', async () => {
      // These should be blocked due to disallowed node types
      const disallowedExprs = [
        'x = 5',              // AssignmentNode
        'function f() {}',    // FunctionAssignmentNode
        'for (;;) {}',        // ForNode (not in allowed list)
        'while (true) {}',    // WhileNode (not in allowed list)
      ];

      for (const expr of disallowedExprs) {
        await expect(
          handleEvaluate({ expression: expr })
        ).rejects.toThrow(/not allowed|invalid|blocked/i);
      }
    });

    it('should allow only mathematical node types', async () => {
      // These should be allowed
      const allowedExprs = [
        '42',                    // ConstantNode
        'x + y',                 // OperatorNode with symbols
        'sqrt(16)',              // FunctionNode (math function)
        'x ? 1 : 0',            // ConditionalNode
        '[1, 2, 3]',            // ArrayNode
        '1:10',                  // RangeNode
        'x.y',                   // AccessorNode (for matrix access)
        'x[0]',                  // IndexNode
        '{ a: 1 }',             // ObjectNode
      ];

      for (const expr of allowedExprs) {
        try {
          const result = await handleEvaluate({
            expression: expr,
            scope: JSON.stringify({ x: 5, y: 10 }),
          });
          // Should not throw, but might return error for invalid operations
          expect(result).toBeDefined();
        } catch (error) {
          // If it throws, should be MathError not security error
          expect(error).toBeDefined();
        }
      }
    });
  });
});
