import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule, getSourceCode } from './utils.ts'

interface AttributePolicy {
  tokens: [trueToken: string, falseToken: string]
  trueBehavior?: string
  falseBehavior: string
}

const INHERITED = (token: string) =>
  `a boolean false removes the attribute, leaving the inherited state rather than "${token}"`
const ARIA_FALSE =
  'a boolean false removes the attribute, producing the "undefined" state rather than "false"'
const ARIA_TRUE =
  'a boolean true writes an empty attribute value, which assistive technologies do not reliably treat as "true"'

const ATTRIBUTES = new Map<string, AttributePolicy>([
  [
    'draggable',
    {
      tokens: ['true', 'false'],
      trueBehavior:
        'a bare or boolean-true draggable writes an empty value, which is invalid and behaves as "auto"',
      falseBehavior: 'a boolean false removes the attribute, which behaves as "auto", not "false"',
    },
  ],
  ['spellcheck', { tokens: ['true', 'false'], falseBehavior: INHERITED('false') }],
  ['contenteditable', { tokens: ['true', 'false'], falseBehavior: INHERITED('false') }],
  ['translate', { tokens: ['yes', 'no'], falseBehavior: INHERITED('no') }],
  [
    'aria-checked',
    { tokens: ['true', 'false'], trueBehavior: ARIA_TRUE, falseBehavior: ARIA_FALSE },
  ],
  [
    'aria-expanded',
    { tokens: ['true', 'false'], trueBehavior: ARIA_TRUE, falseBehavior: ARIA_FALSE },
  ],
  [
    'aria-hidden',
    { tokens: ['true', 'false'], trueBehavior: ARIA_TRUE, falseBehavior: ARIA_FALSE },
  ],
  [
    'aria-pressed',
    { tokens: ['true', 'false'], trueBehavior: ARIA_TRUE, falseBehavior: ARIA_FALSE },
  ],
  [
    'aria-selected',
    { tokens: ['true', 'false'], trueBehavior: ARIA_TRUE, falseBehavior: ARIA_FALSE },
  ],
])

const BOOLEAN_OPERATORS = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'in',
  'instanceof',
])

const isProvablyBoolean = (node: T.Node): boolean => {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'boolean'
    case 'UnaryExpression':
      return node.operator === '!'
    case 'BinaryExpression':
      return BOOLEAN_OPERATORS.has(node.operator)
    case 'LogicalExpression':
      return node.operator !== '??' && isProvablyBoolean(node.left) && isProvablyBoolean(node.right)
    default:
      return false
  }
}

export const noBooleanEnumeratedAttributeRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow boolean values on enumerated attributes like draggable and tristate aria-*, which take string tokens — a boolean false removes the attribute instead of writing "false".',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-boolean-enumerated-attribute.md',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      booleanValue:
        '\'{{name}}\' is an enumerated attribute, not a boolean one: {{behavior}}. Use the string "{{token}}".',
      booleanExpression:
        "'{{name}}' is an enumerated attribute, not a boolean one: {{behavior}}. Map the expression to its string tokens.",
      useStrings: 'Write the string tokens: {expr ? "{{trueToken}}" : "{{falseToken}}"}.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['JSXAttribute'],
  create(context) {
    const sourceCode = getSourceCode(context)

    return {
      JSXAttribute(node) {
        const element = node.parent
        if (
          element?.type !== 'JSXOpeningElement' ||
          element.name.type !== 'JSXIdentifier' ||
          !/^[a-z]/.test(element.name.name)
        ) {
          return
        }
        if (node.name.type !== 'JSXIdentifier') return
        const name = node.name.name
        const policy = ATTRIBUTES.get(name)
        if (!policy) return
        const [trueToken, falseToken] = policy.tokens

        if (!node.value) {
          if (policy.trueBehavior) {
            context.report({
              node,
              messageId: 'booleanValue',
              data: { name, behavior: policy.trueBehavior, token: trueToken },
              fix: (fixer) => fixer.insertTextAfter(node, `="${trueToken}"`),
            })
          }
          return
        }

        if (node.value.type !== 'JSXExpressionContainer') return
        const expression = node.value.expression

        if (expression.type === 'Literal' && typeof expression.value === 'boolean') {
          const behavior = expression.value ? policy.trueBehavior : policy.falseBehavior
          if (!behavior) return
          const token = expression.value ? trueToken : falseToken
          context.report({
            node: node.value,
            messageId: 'booleanValue',
            data: { name, behavior, token },
            fix: (fixer) => fixer.replaceText(node.value!, `"${token}"`),
          })
          return
        }

        if (isProvablyBoolean(expression)) {
          context.report({
            node: node.value,
            messageId: 'booleanExpression',
            data: { name, behavior: policy.falseBehavior },
            suggest: [
              {
                messageId: 'useStrings',
                data: { trueToken, falseToken },
                fix: (fixer) =>
                  fixer.replaceText(
                    node.value!,
                    `{${sourceCode.getText(expression)} ? "${trueToken}" : "${falseToken}"}`,
                  ),
              },
            ],
          })
        }
      },
    }
  },
})
