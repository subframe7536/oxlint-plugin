import { createOnceRule } from './utils.ts'
import { getSolidSourceRegex, trackImports } from './utils.ts'

export const noSingleArgCreateEffectRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require the two-argument `createEffect(compute, effect)` form used by Solid 2.0.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-single-arg-create-effect.md',
    },
    schema: [],
    messages: {
      singleArgEffect:
        'In Solid 2.0, createEffect takes separate compute and effect functions: `createEffect(() => signal(), (value) => doWork(value))`. For a derived value use `createMemo`; for a one-shot side effect, just call the function directly.',
      singleArgRenderEffect:
        'In Solid 2.0, createRenderEffect takes separate compute and effect functions: `createRenderEffect(() => signal(), (value) => doWork(value))`.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'CallExpression'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    return {
      ImportDeclaration: handleImportDeclaration,
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.arguments.length !== 1) return
        if (matchImport('createEffect', node.callee.name)) {
          context.report({ node, messageId: 'singleArgEffect' })
        } else if (matchImport('createRenderEffect', node.callee.name)) {
          context.report({ node, messageId: 'singleArgRenderEffect' })
        }
      },
    }
  },
})
