import type { Rule, ESTree } from '@oxlint/plugins'

function jsxPropName(prop: ESTree.JSXAttribute): string {
  if (prop.name.type === 'JSXNamespacedName') {
    const ns = prop.name as ESTree.JSXNamespacedName
    return `${ns.namespace.name}:${ns.name.name}`
  }
  return (prop.name as ESTree.JSXIdentifier).name
}

function getStaticString(node: ESTree.Node): string | null {
  if (node.type === 'Literal') {
    const v = (node as { value: unknown }).value
    return typeof v === 'string' ? v : null
  }
  return null
}

export const noInnerHTMLRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow usage of the innerHTML attribute, which can often lead to security vulnerabilities.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-innerhtml.md',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowStatic: {
            description:
              'if the innerHTML value is guaranteed to be a static HTML string (i.e. no user input), allow it',
            type: 'boolean',
            default: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      dangerous:
        'The innerHTML attribute is dangerous; passing unsanitized input can lead to security vulnerabilities.',
      conflict:
        'The innerHTML attribute should not be used on an element with child elements; they will be overwritten.',
      notHtml: 'The string passed to innerHTML does not appear to be valid HTML.',
      useInnerText: 'For text content, using innerText is clearer and safer.',
      dangerouslySetInnerHTML:
        'The dangerouslySetInnerHTML prop is not supported; use innerHTML instead.',
    },
  },
  create(context) {
    const allowStatic = Boolean(
      ((context.options as [{ allowStatic?: boolean }?])[0]?.allowStatic) ?? true,
    )

    return {
      JSXAttribute(node) {
        const propName = jsxPropName(node)

        if (propName === 'dangerouslySetInnerHTML') {
          if (
            node.value?.type === 'JSXExpressionContainer' &&
            node.value.expression.type === 'ObjectExpression'
          ) {
            const objExpr = node.value.expression as ESTree.ObjectExpression
            const props = objExpr.properties
            if (
              props.length === 1 &&
              props[0]!.type === 'Property' &&
              (props[0] as ESTree.ObjectProperty).key.type === 'Identifier' &&
              ((props[0] as ESTree.ObjectProperty).key as ESTree.IdentifierReference).name === '__html'
            ) {
              const htmlValue = (props[0] as ESTree.ObjectProperty).value as ESTree.Node
              context.report({
                node,
                messageId: 'dangerouslySetInnerHTML',
                fix: (fixer) => [
                  fixer.replaceTextRange([node.range[0], htmlValue.range[0]], 'innerHTML={'),
                  fixer.replaceTextRange([htmlValue.range[1], node.range[1]], '}'),
                ],
              })
            } else {
              context.report({ node, messageId: 'dangerouslySetInnerHTML' })
            }
          } else {
            context.report({ node, messageId: 'dangerouslySetInnerHTML' })
          }
          return
        }

        if (propName !== 'innerHTML') return

        if (allowStatic) {
          const innerHtmlNode =
            node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value

          if (!innerHtmlNode || innerHtmlNode.type === 'JSXEmptyExpression') {
            context.report({ node, messageId: 'dangerous' })
            return
          }

          const innerHtml = getStaticString(innerHtmlNode)
          if (typeof innerHtml === 'string') {
            const looksLikeHtml = /<[a-z][^>]*>/i.test(innerHtml)
            if (looksLikeHtml) {
              if (
                node.parent?.parent?.type === 'JSXElement' &&
                (node.parent.parent as ESTree.JSXElement).children?.length
              ) {
                context.report({ node: node.parent.parent, messageId: 'conflict' })
              }
              // Static valid HTML - allowed
            } else {
              context.report({
                node,
                messageId: 'notHtml',
                suggest: [
                  {
                    messageId: 'useInnerText',
                    fix: (fixer) => fixer.replaceText(node.name, 'innerText'),
                  },
                ],
              })
            }
          } else {
            context.report({ node, messageId: 'dangerous' })
          }
        } else {
          context.report({ node, messageId: 'dangerous' })
        }
      },
    }
  },
}
