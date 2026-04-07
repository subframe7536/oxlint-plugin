import type { Rule, ESTree } from '@oxlint/plugins'
import { isJSXElementOrFragment } from './utils.ts'

const EXPENSIVE_TYPES = ['JSXElement', 'JSXFragment', 'Identifier']

export const preferShowRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforce using Solid's `<Show />` component for conditionally showing content. Solid's compiler covers this case, so it's a stylistic rule only.",
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/prefer-show.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferShowAnd: "Use Solid's `<Show />` component for conditionally showing content.",
      preferShowTernary:
        "Use Solid's `<Show />` component for conditionally showing content with a fallback.",
    },
  },
  createOnce(context) {
    let sourceCode: typeof context.sourceCode
    const putIntoJSX = (node: ESTree.Node): string => {
      const text = sourceCode.getText(node)
      return isJSXElementOrFragment(node) ? text : `{${text}}`
    }

    const logicalExpressionHandler = (node: ESTree.LogicalExpression) => {
      if (node.operator === '&&' && EXPENSIVE_TYPES.includes(node.right.type)) {
        // Determine the best AST node to replace: either the JSXExpressionContainer
        // or (when inside an arrow function) the parent JSXExpressionContainer that
        // wraps the ArrowFunctionExpression.
        const replaceTarget =
          node.parent?.type === 'JSXExpressionContainer' &&
          isJSXElementOrFragment(node.parent.parent)
            ? node.parent
            : node.parent?.type === 'ArrowFunctionExpression' &&
                node.parent.parent?.type === 'JSXExpressionContainer' &&
                isJSXElementOrFragment(node.parent.parent.parent)
              ? node.parent.parent
              : node

        context.report({
          node,
          messageId: 'preferShowAnd',
          fix: (fixer) =>
            fixer.replaceText(
              replaceTarget,
              `<Show when={${sourceCode.getText(node.left)}}>${putIntoJSX(node.right)}</Show>`,
            ),
        })
      }
    }

    const conditionalExpressionHandler = (node: ESTree.ConditionalExpression) => {
      if (
        EXPENSIVE_TYPES.includes(node.consequent.type) ||
        EXPENSIVE_TYPES.includes(node.alternate.type)
      ) {
        const replaceTarget =
          node.parent?.type === 'JSXExpressionContainer' &&
          isJSXElementOrFragment(node.parent.parent)
            ? node.parent
            : node.parent?.type === 'ArrowFunctionExpression' &&
                node.parent.parent?.type === 'JSXExpressionContainer' &&
                isJSXElementOrFragment(node.parent.parent.parent)
              ? node.parent.parent
              : node

        context.report({
          node,
          messageId: 'preferShowTernary',
          fix: (fixer) =>
            fixer.replaceText(
              replaceTarget,
              `<Show when={${sourceCode.getText(node.test)}} fallback={${sourceCode.getText(node.alternate)}}>${putIntoJSX(node.consequent)}</Show>`,
            ),
        })
      }
    }

    return {
      before() {
        sourceCode = context.sourceCode
      },
      JSXExpressionContainer(node) {
        if (!isJSXElementOrFragment(node.parent)) {
          return
        }
        if (node.expression.type === 'LogicalExpression') {
          logicalExpressionHandler(node.expression as ESTree.LogicalExpression)
        } else if (
          node.expression.type === 'ArrowFunctionExpression' &&
          (node.expression as ESTree.ArrowFunctionExpression).body.type === 'LogicalExpression'
        ) {
          logicalExpressionHandler(
            (node.expression as ESTree.ArrowFunctionExpression).body as ESTree.LogicalExpression,
          )
        } else if (node.expression.type === 'ConditionalExpression') {
          conditionalExpressionHandler(node.expression as ESTree.ConditionalExpression)
        } else if (
          node.expression.type === 'ArrowFunctionExpression' &&
          (node.expression as ESTree.ArrowFunctionExpression).body.type === 'ConditionalExpression'
        ) {
          conditionalExpressionHandler(
            (node.expression as ESTree.ArrowFunctionExpression)
              .body as ESTree.ConditionalExpression,
          )
        }
      },
    }
  },
}
