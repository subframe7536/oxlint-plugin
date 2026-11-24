import { createOnceRule } from './utils.ts'
import { findParent, isFunctionNode, getSolidSourceRegex, trackImports } from './utils.ts'

const REACTIVE_PRIMITIVES = [
  'createSignal',
  'createMemo',
  'createDeferred',
  'createStore',
  'createEffect',
  'createRenderEffect',
  'createOptimistic',
  'createOptimisticStore',
  'createProjection',
]

export const noModuleScopeReactivePrimitiveRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reactive primitives at module scope, where state is shared across SSR requests.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-module-scope-reactive-primitive.md',
    },
    schema: [],
    messages: {
      moduleScopePrimitive:
        '{{name}} at module scope creates state shared across all SSR requests. Create it inside a component or provider, or wrap it in `createRoot` if module-level state is intentional (client-only).',
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'CallExpression'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    return {
      ImportDeclaration: handleImportDeclaration,
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return
        const name = matchImport(REACTIVE_PRIMITIVES, node.callee.name)
        if (!name) return
        if (findParent(node, isFunctionNode) == null) {
          context.report({
            node,
            messageId: 'moduleScopePrimitive',
            data: { name: node.callee.name },
          })
        }
      },
    }
  },
})
