import type { Rule, ESTree } from '@oxlint/plugins'

export const jsxUsesVarsRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent variables used in JSX from being marked as unused.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-uses-vars.md',
    },
    schema: [],
    messages: {},
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        switch (node.name.type) {
          case 'JSXNamespacedName':
            return
          case 'JSXIdentifier':
            context.sourceCode.markVariableAsUsed(
              (node.name as ESTree.JSXIdentifier).name,
              node.name,
            )
            break
          case 'JSXMemberExpression': {
            let parent: ESTree.JSXMemberExpressionObject = node.name.object
            while (parent.type === 'JSXMemberExpression') {
              parent = (parent as ESTree.JSXMemberExpression).object
            }
            if (parent.type === 'JSXIdentifier') {
              context.sourceCode.markVariableAsUsed(
                (parent as ESTree.JSXIdentifier).name,
                parent,
              )
            }
            break
          }
        }
      },
      'JSXAttribute > JSXNamespacedName': (node: ESTree.Node) => {
        const nsNode = node as ESTree.JSXNamespacedName
        if (
          nsNode.namespace?.type === 'JSXIdentifier' &&
          (nsNode.namespace as ESTree.JSXIdentifier).name === 'use' &&
          nsNode.name?.type === 'JSXIdentifier'
        ) {
          context.sourceCode.markVariableAsUsed(
            (nsNode.name as ESTree.JSXIdentifier).name,
            nsNode.name,
          )
        }
      },
    }
  },
}
