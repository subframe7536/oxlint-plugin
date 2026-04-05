import type { Rule, ESTree } from '@oxlint/plugins'
import { isDOMElementName } from './utils.ts'

function isComponent(node: ESTree.JSXOpeningElement) {
  return (
    (node.name.type === 'JSXIdentifier' &&
      !isDOMElementName((node.name as ESTree.JSXIdentifier).name)) ||
    node.name.type === 'JSXMemberExpression'
  )
}

const voidDOMElementRegex =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/

function isVoidDOMElementName(name: string): boolean {
  return voidDOMElementRegex.test(name)
}

function childrenIsEmpty(node: ESTree.JSXOpeningElement): boolean {
  return (node.parent as ESTree.JSXElement).children.length === 0
}

function childrenIsMultilineSpaces(node: ESTree.JSXOpeningElement): boolean {
  const children = (node.parent as ESTree.JSXElement).children
  return (
    children.length === 1 &&
    children[0].type === 'JSXText' &&
    (children[0] as ESTree.JSXText).value.indexOf('\n') !== -1 &&
    (children[0] as ESTree.JSXText).value.replace(/(?!\xA0)\s/g, '') === ''
  )
}

export const selfClosingCompRule: Rule = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Disallow extra closing tags for components without children.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/self-closing-comp.md',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          component: {
            type: 'string',
            description: 'which Solid components should be self-closing when possible',
            enum: ['all', 'none'],
            default: 'all',
          },
          html: {
            type: 'string',
            description: 'which native elements should be self-closing when possible',
            enum: ['all', 'void', 'none'],
            default: 'all',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      selfClose: 'Empty components are self-closing.',
      dontSelfClose: 'This element should not be self-closing.',
    },
  },
  create(context) {
    const options = (context.options as [{ component?: string; html?: string }?])[0]

    function shouldBeSelfClosedWhenPossible(node: ESTree.JSXOpeningElement): boolean {
      if (isComponent(node)) {
        return (options?.component ?? 'all') === 'all'
      } else if (
        node.name.type === 'JSXIdentifier' &&
        isDOMElementName((node.name as ESTree.JSXIdentifier).name)
      ) {
        const whichHTML = options?.html ?? 'all'
        switch (whichHTML) {
          case 'all':
            return true
          case 'void':
            return isVoidDOMElementName((node.name as ESTree.JSXIdentifier).name)
          case 'none':
            return false
        }
      }
      return true
    }

    return {
      JSXOpeningElement(node) {
        const canSelfClose = childrenIsEmpty(node) || childrenIsMultilineSpaces(node)
        if (canSelfClose) {
          const shouldSelfClose = shouldBeSelfClosedWhenPossible(node)
          if (shouldSelfClose && !node.selfClosing) {
            context.report({
              node,
              messageId: 'selfClose',
              fix(fixer) {
                const openingElementEnding = node.range[1] - 1
                const closingElementEnding = (node.parent as ESTree.JSXElement).closingElement!
                  .range[1]
                return fixer.replaceTextRange([openingElementEnding, closingElementEnding], ' />')
              },
            })
          } else if (!shouldSelfClose && node.selfClosing) {
            context.report({
              node,
              messageId: 'dontSelfClose',
              fix(fixer) {
                const sourceCode = context.sourceCode
                const tagName = sourceCode.getText(node.name)
                const selfCloseEnding = node.range[1]
                const lastTokens = sourceCode.getLastTokens(node, { count: 2 })
                const secondToLast = lastTokens[0]
                const closeRange: [number, number] =
                  secondToLast?.value === '/'
                    ? [secondToLast.range[0], selfCloseEnding]
                    : [selfCloseEnding - 1, selfCloseEnding]
                return fixer.replaceTextRange(closeRange, `></${tagName}>`)
              },
            })
          }
        }
      },
    }
  },
}
