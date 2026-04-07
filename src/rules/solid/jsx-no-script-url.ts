import type { Rule } from '@oxlint/plugins'
import { getStaticStringValue } from './utils.ts'

// A javascript: URL can contain leading C0 control or \u0020 SPACE,
// and any newline or tab are filtered out as if they're not part of the URL.
const isJavaScriptProtocol =
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i // eslint-disable-line no-control-regex

export const jsxNoScriptUrlRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow javascript: URLs.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-script-url.md',
    },
    schema: [],
    messages: {
      noJSURL: "For security, don't use javascript: URLs. Use event handlers instead if you can.",
    },
  },
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !node.value) return

        const valueNode =
          node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value

        if (valueNode.type === 'JSXEmptyExpression') {
          return
        }

        const str = getStaticStringValue(valueNode)
        if (typeof str === 'string' && isJavaScriptProtocol.test(str)) {
          context.report({
            node: node.value,
            messageId: 'noJSURL',
          })
        }
      },
    }
  },
}
