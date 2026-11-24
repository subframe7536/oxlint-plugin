import type { ESTree as T, Fixer } from '@oxlint/plugins'
import { createOnceRule, findVariable, getSourceCode } from './utils.ts'
import { getSolidSourceRegex, isFunctionNode, trace, trackImports } from './utils.ts'

export const noUnusedSignalRule = createOnceRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow signals that are never written (use a plain value) or never read (dead state).',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-unused-signal.md',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      neverWritten:
        'This {{kind}} is never written, so its value can never change. Use a plain value, or `createMemo` if it should derive from reactive state.',
      neverRead:
        'This {{kind}} is never read, so setting it has no effect. Remove the {{kind}}, or read the value where the state should be used.',
      replaceWithAccessor: 'Replace with a constant accessor.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'VariableDeclarator'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    const isUsed = (element: T.Node & { name: string }): boolean => {
      const variable = findVariable(context, element)
      if (!variable) return true
      return variable.references.some((ref) => !ref.init)
    }

    return {
      ImportDeclaration: handleImportDeclaration,
      VariableDeclarator(node) {
        if (
          node.init?.type !== 'CallExpression' ||
          node.init.callee.type !== 'Identifier' ||
          node.id.type !== 'ArrayPattern' ||
          node.id.elements.length > 2
        ) {
          return
        }
        const primitive = matchImport(
          ['createSignal', 'createStore', 'createOptimistic'],
          node.init.callee.name,
        )
        if (!primitive) return
        const kind =
          primitive === 'createSignal'
            ? 'signal'
            : primitive === 'createStore'
              ? 'store'
              : 'optimistic value'
        const [accessor = null, setter = null] = node.id.elements
        if (
          (accessor && accessor.type !== 'Identifier') ||
          (setter && setter.type !== 'Identifier')
        ) {
          return
        }
        if (
          node.parent?.type === 'VariableDeclaration' &&
          node.parent.parent?.type === 'ExportNamedDeclaration'
        ) {
          return
        }

        if (!accessor || !isUsed(accessor)) {
          context.report({ node: accessor ?? node.id, messageId: 'neverRead', data: { kind } })
          return
        }
        const firstArg = node.init.arguments[0]
        if (firstArg && isFunctionNode(trace(firstArg, context))) return
        if (!setter || !isUsed(setter)) {
          const init = node.init
          const initialValue = init.arguments[0]
          const suggest =
            primitive === 'createSignal' && (!initialValue || initialValue.type === 'Literal')
              ? [
                  {
                    messageId: 'replaceWithAccessor' as const,
                    fix: (fixer: Fixer) =>
                      fixer.replaceText(
                        node,
                        `${accessor.name} = () => ${
                          initialValue ? getSourceCode(context).getText(initialValue) : 'undefined'
                        }`,
                      ),
                  },
                ]
              : undefined
          context.report({
            node: setter ?? node.id,
            messageId: 'neverWritten',
            data: { kind },
            suggest,
          })
        }
      },
    }
  },
})
