import { createOnceRule, getStaticValue, getScope } from './utils.ts'

const isJavaScriptProtocol =
  /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i

export const jsxNoScriptUrlRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow javascript: URLs.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-script-url.md',
    },
    schema: [],
    messages: {
      noJSURL: "For security, don't use javascript: URLs. Use event handlers instead if you can.",
    },
  },
  defaultOptions: [],
  visitorKeys: ['JSXAttribute'],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && node.value) {
          const link: { value: unknown } | null = getStaticValue(
            node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value,
            getScope(context, node),
          )
          if (link && typeof link.value === 'string' && isJavaScriptProtocol.test(link.value)) {
            context.report({
              node: node.value,
              messageId: 'noJSURL',
            })
          }
        }
      },
    }
  },
})
