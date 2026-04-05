import type { Rule, ESTree } from '@oxlint/plugins'
import { isFunctionNode, isJSXElementOrFragment } from './utils.ts'

export const preferForRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: "Enforce using Solid's `<For />` component for mapping an array to JSX elements.",
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/prefer-for.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferFor:
        "Use Solid's `<For />` component for efficiently rendering lists. Array#map causes DOM elements to be recreated.",
      preferForOrIndex:
        "Use Solid's `<For />` component or `<Index />` component for rendering lists. Array#map causes DOM elements to be recreated.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callOrChain = node.parent?.type === 'ChainExpression' ? node.parent : node
        if (
          callOrChain.parent?.type === 'JSXExpressionContainer' &&
          isJSXElementOrFragment(callOrChain.parent.parent)
        ) {
          const callee = node.callee
          if (
            callee.type === 'MemberExpression' &&
            !(callee as ESTree.MemberExpression).computed &&
            (callee as ESTree.MemberExpression).property.type === 'Identifier' &&
            ((callee as ESTree.StaticMemberExpression).property as ESTree.IdentifierName).name === 'map' &&
            node.arguments.length === 1 &&
            isFunctionNode(node.arguments[0])
          ) {
            const mapFnNode = node.arguments[0]
            const jsxContainer = callOrChain.parent as ESTree.JSXExpressionContainer
            const arrayNode = (callee as ESTree.StaticMemberExpression).object
            if (mapFnNode.params.length === 1 && mapFnNode.params[0]?.type !== 'RestElement') {
              context.report({
                node,
                messageId: 'preferFor',
                fix: (fixer) => {
                  const beforeArray: [number, number] = [jsxContainer.range[0], arrayNode.range[0]]
                  const betweenArrayAndMapFn: [number, number] = [arrayNode.range[1], mapFnNode.range[0]]
                  const afterMapFn: [number, number] = [mapFnNode.range[1], jsxContainer.range[1]]
                  return [
                    fixer.replaceTextRange(beforeArray, '<For each={'),
                    fixer.replaceTextRange(betweenArrayAndMapFn, '}>{'),
                    fixer.replaceTextRange(afterMapFn, '}</For>'),
                  ]
                },
              })
            } else {
              context.report({ node, messageId: 'preferForOrIndex' })
            }
          } else if (
            callee.type === 'MemberExpression' &&
            (callee as ESTree.MemberExpression).computed &&
            (() => {
              const prop = (callee as ESTree.ComputedMemberExpression).property
              return prop.type === 'Literal' && ((prop as { value: unknown }).value as string) === 'map'
            })() &&
            node.arguments.length === 1 &&
            isFunctionNode(node.arguments[0])
          ) {
            context.report({ node, messageId: 'preferForOrIndex' })
          }
        }
      },
    }
  },
}
