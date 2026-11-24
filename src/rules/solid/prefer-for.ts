import type { ESTree, Rule } from '@oxlint/plugins'
import { getPropertyName, isFunctionNode, isJSXElementOrFragment, isSolidV2 } from './utils.ts'

export const preferForRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforce using Solid's `<For />` component for mapping an array to JSX elements.",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/prefer-for.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferFor:
        "Use Solid's `<For />` component for efficiently rendering lists. Array#map causes DOM elements to be recreated.",
      preferForOrIndex:
        "Use Solid's `<For />` component or `<Index />` component for rendering lists. Array#map causes DOM elements to be recreated.",
      preferForOrForUnkeyed:
        "Use Solid's `<For />` component, or `<For keyed={false} />` for index-keyed lists, for rendering lists. Array#map causes DOM elements to be recreated.",
    },
  },
  createOnce(context) {
    let v2 = false

    const reportPreferFor = (node: ESTree.CallExpression) => {
      const callOrChain = node.parent?.type === 'ChainExpression' ? node.parent : node
      const jsxExpressionContainerNode = callOrChain.parent as ESTree.JSXExpressionContainer
      const arrayNode = (node.callee as ESTree.MemberExpression).object
      const mapFnNode = node.arguments[0]
      context.report({
        node,
        messageId: 'preferFor',
        fix: (fixer) => {
          const beforeArray: [number, number] = [
            jsxExpressionContainerNode.range[0],
            arrayNode.range[0],
          ]
          const betweenArrayAndMapFn: [number, number] = [arrayNode.range[1], mapFnNode.range[0]]
          const afterMapFn: [number, number] = [
            mapFnNode.range[1],
            jsxExpressionContainerNode.range[1],
          ]
          return [
            fixer.replaceTextRange(beforeArray, '<For each={'),
            fixer.replaceTextRange(betweenArrayAndMapFn, '}>{'),
            fixer.replaceTextRange(afterMapFn, '}</For>'),
          ]
        },
      })
    }

    return {
      before() {
        v2 = isSolidV2(context)
      },
      CallExpression(node) {
        const callOrChain = node.parent?.type === 'ChainExpression' ? node.parent : node
        if (
          callOrChain.parent?.type === 'JSXExpressionContainer' &&
          isJSXElementOrFragment(callOrChain.parent.parent as ESTree.Node | null | undefined)
        ) {
          if (
            node.callee.type === 'MemberExpression' &&
            getPropertyName(node.callee as ESTree.MemberExpression) === 'map' &&
            node.arguments.length === 1 &&
            isFunctionNode(node.arguments[0])
          ) {
            const mapFnNode = node.arguments[0]
            if (mapFnNode.params.length === 1 && mapFnNode.params[0].type !== 'RestElement') {
              reportPreferFor(node)
            } else {
              context.report({
                node,
                messageId: v2 ? 'preferForOrForUnkeyed' : 'preferForOrIndex',
              })
            }
          }
        }
      },
    }
  },
}
