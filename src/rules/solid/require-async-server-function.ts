import type { ESTree as T } from '@oxlint/plugins'
import {
  type FunctionNode,
  isFunctionNode,
  hasUseServerDirective,
  getUseServerEligibility,
  isInsideUseServerFunction,
  programHasUseServerDirective,
} from './utils.ts'
import { createOnceRule, getFunctionHeadLocation, findVariable, getSourceCode } from './utils.ts'

export const requireAsyncServerFunctionRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Require server functions to be async, matching their client-side contract.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/require-async-server-function.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      asyncServerFunction:
        'Server functions should be async: on the client every call resolves a Promise, but during server rendering this function is called in-process and returns synchronously, so the same code observes two different types.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['Program', ':function', 'ExportNamedDeclaration', 'ExportDefaultDeclaration'],
  create(context) {
    const sourceCode = getSourceCode(context)
    let moduleLevel = false

    const checkFunction = (fn: FunctionNode) => {
      if (fn.async) return
      context.report({
        loc: getFunctionHeadLocation(fn, sourceCode),
        messageId: 'asyncServerFunction',
        fix: (fixer) => {
          const firstToken = sourceCode.getFirstToken(fn)
          return firstToken ? fixer.insertTextBefore(firstToken, 'async ') : null
        },
      })
    }

    const resolveExportedFunction = (
      identifier: T.Node & { name: string },
    ): FunctionNode | null => {
      const variable = findVariable(context, identifier)
      const def = variable?.defs[0]
      if (!def) return null
      if (def.type === 'FunctionName' && isFunctionNode(def.node)) return def.node
      if (
        def.type === 'Variable' &&
        def.node.type === 'VariableDeclarator' &&
        isFunctionNode(def.node.init)
      ) {
        return def.node.init
      }
      return null
    }

    return {
      Program(node) {
        moduleLevel = programHasUseServerDirective(node)
      },
      ':function'(node: T.Node) {
        if (!isFunctionNode(node)) return
        if (
          !moduleLevel &&
          hasUseServerDirective(node) &&
          getUseServerEligibility(node) === 'eligible' &&
          !isInsideUseServerFunction(node)
        ) {
          checkFunction(node)
        }
      },
      ExportNamedDeclaration(node) {
        if (!moduleLevel) return
        if (node.declaration) {
          if (isFunctionNode(node.declaration)) {
            checkFunction(node.declaration)
          } else if (node.declaration.type === 'VariableDeclaration') {
            for (const declarator of node.declaration.declarations) {
              if (isFunctionNode(declarator.init)) checkFunction(declarator.init)
            }
          }
        } else {
          for (const specifier of node.specifiers) {
            if (specifier.local.type !== 'Identifier') continue
            const fn = resolveExportedFunction(specifier.local)
            if (fn) checkFunction(fn)
          }
        }
      },
      ExportDefaultDeclaration(node) {
        if (!moduleLevel) return
        if (isFunctionNode(node.declaration)) checkFunction(node.declaration)
      },
    }
  },
})
