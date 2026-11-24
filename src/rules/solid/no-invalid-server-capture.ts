import type { ESTree as T } from '@oxlint/plugins'
import {
  isFunctionNode,
  hasUseServerDirective,
  getUseServerEligibility,
  isInsideUseServerFunction,
  programHasUseServerDirective,
} from './utils.ts'
import { createOnceRule, getSourceCode } from './utils.ts'

export const noInvalidServerCaptureRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow server functions from capturing variables in enclosing non-module scopes, mirroring the compiler's build-time validation.",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-invalid-server-capture.md',
    },
    schema: [],
    messages: {
      invalidCapture:
        "Server functions cannot capture '{{name}}' from an enclosing {{kind}}: on the server the function is hoisted to module level and on the client it becomes a network proxy, so the captured variable does not exist at runtime. Use parameters, module-level bindings, imports, or globals instead.",
    },
  },
  defaultOptions: [],
  visitorKeys: ['Program', ':function'],
  create(context) {
    const sourceCode = getSourceCode(context)
    let moduleLevel = false

    return {
      Program(node) {
        moduleLevel = programHasUseServerDirective(node)
      },
      ':function'(node: T.Node) {
        if (!isFunctionNode(node)) return
        if (moduleLevel) return
        if (!hasUseServerDirective(node)) return
        if (getUseServerEligibility(node) !== 'eligible') return
        if (isInsideUseServerFunction(node)) return

        const scope = sourceCode.scopeManager?.acquire(node)
        if (!scope) return
        for (const reference of scope.through) {
          const variable = reference.resolved
          if (!variable) continue
          const typedReference = reference as {
            isTypeReference?: boolean
            isValueReference?: boolean
          }
          if (typedReference.isTypeReference && !typedReference.isValueReference) continue
          const declarationScope = variable.scope
          if (declarationScope.type === 'module' || declarationScope.type === 'global') continue
          if (
            declarationScope.type === 'function-expression-name' &&
            declarationScope.block === node
          ) {
            continue
          }
          context.report({
            node: reference.identifier,
            messageId: 'invalidCapture',
            data: {
              name: reference.identifier.name,
              kind: declarationScope.type === 'function' ? 'function' : 'block',
            },
          })
        }
      },
    }
  },
})
