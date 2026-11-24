import type { ESTree as T, Reference } from '@oxlint/plugins'
import {
  isFunctionNode,
  hasUseServerDirective,
  getUseServerEligibility,
  isInsideUseServerFunction,
  programHasUseServerDirective,
} from './utils.ts'
import { createOnceRule, getSourceCode } from './utils.ts'

const BROWSER_GLOBALS = new Set([
  'window',
  'document',
  'alert',
  'confirm',
  'prompt',
  'localStorage',
  'sessionStorage',
  'history',
  'location',
  'matchMedia',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'customElements',
])

export const noBrowserGlobalsInServerFunctionRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow browser-only globals inside server functions, which run exclusively on the server.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-browser-globals-in-server-function.md',
    },
    schema: [],
    messages: {
      browserGlobal:
        "'{{name}}' is a browser global, and server functions only run on the server, where it does not exist. Read request data from the function's arguments or use server platform APIs instead.",
    },
  },
  defaultOptions: [],
  visitorKeys: ['Program', ':function'],
  create(context) {
    const sourceCode = getSourceCode(context)
    let moduleLevel = false

    const checkReferences = (references: Reference[]) => {
      for (const reference of references) {
        const name = reference.identifier.name
        if (!BROWSER_GLOBALS.has(name)) continue
        if (reference.resolved && reference.resolved.defs.length > 0) continue
        const parent = reference.identifier.parent
        if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof') continue
        context.report({
          node: reference.identifier,
          messageId: 'browserGlobal',
          data: { name },
        })
      }
    }

    return {
      Program(node) {
        moduleLevel = programHasUseServerDirective(node)
        if (moduleLevel) {
          for (const scope of sourceCode.scopeManager?.scopes ?? []) {
            checkReferences(scope.references)
          }
        }
      },
      ':function'(node: T.Node) {
        if (moduleLevel || !isFunctionNode(node)) return
        if (!hasUseServerDirective(node)) return
        if (getUseServerEligibility(node) !== 'eligible') return
        if (isInsideUseServerFunction(node)) return
        const scope = sourceCode.scopeManager?.acquire(node)
        if (scope) checkReferences(scope.through)
      },
    }
  },
})
