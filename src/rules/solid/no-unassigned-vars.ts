import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule, getSourceCode } from './utils.ts'

const isRefValue = (identifier: T.Node): boolean => {
  const value = identifier.parent?.type === 'TSNonNullExpression' ? identifier.parent : identifier
  const container = value.parent
  return (
    container?.type === 'JSXExpressionContainer' &&
    container.parent?.type === 'JSXAttribute' &&
    container.parent.name.type === 'JSXIdentifier' &&
    container.parent.name.name === 'ref'
  )
}

export const noUnassignedVarsRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow `let` and `var` variables that are read but never assigned, counting `ref={el}` as an assignment. Replaces ESLint's `no-unassigned-vars`.",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-unassigned-vars.md',
    },
    schema: [],
    messages: {
      unassigned: "'{{name}}' is always 'undefined' because it's never assigned.",
    },
  },
  defaultOptions: [],
  visitorKeys: [
    'TSModuleDeclaration[declare=true]',
    'TSModuleDeclaration[declare=true]:exit',
    'VariableDeclarator',
  ],
  create(context) {
    const sourceCode = getSourceCode(context)
    let insideDeclareModule = false

    return {
      'TSModuleDeclaration[declare=true]'() {
        insideDeclareModule = true
      },
      'TSModuleDeclaration[declare=true]:exit'() {
        insideDeclareModule = false
      },
      VariableDeclarator(node) {
        const declaration = node.parent
        if (
          node.init ||
          node.id.type !== 'Identifier' ||
          declaration.kind === 'const' ||
          declaration.declare ||
          insideDeclareModule
        ) {
          return
        }
        const [variable] = sourceCode.getDeclaredVariables(node)
        if (!variable) return

        let hasRead = false
        for (const reference of variable.references) {
          if (reference.isWrite() || isRefValue(reference.identifier)) return
          if (reference.isRead()) hasRead = true
        }
        if (!hasRead) return

        context.report({ node, messageId: 'unassigned', data: { name: node.id.name } })
      },
    }
  },
})
