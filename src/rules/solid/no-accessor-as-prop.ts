import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule, findVariable } from './utils.ts'
import { isDOMElementName, isFunctionNode, getSolidSourceRegex, trackImports } from './utils.ts'

const FUNCTION_ATTRIBUTES = new Set(['ref', 'children'])
const isOnPrefixed = (name: string) => name.length > 2 && name.startsWith('on')

export const noAccessorAsPropRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow passing uncalled signal accessors or other functions as value-typed DOM element attributes.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-accessor-as-prop.md',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      accessorAsProp:
        "'{{attribute}}' expects a value, but '{{name}}' is a signal accessor — call it: '{{name}}()'.",
      functionAsProp:
        "'{{attribute}}' expects a value, but this is a function; it would render as a stringified function. If it derives a value, call it.",
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'JSXAttribute'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    const resolveFunctionKind = (id: T.Node & { name: string }): 'accessor' | 'function' | null => {
      const variable = findVariable(context, id)
      const def = variable?.defs[0]
      if (!def) return null

      if (def.type === 'FunctionName') return 'function'
      if (def.type !== 'Variable' || def.node.type !== 'VariableDeclarator' || !def.node.init)
        return null

      const { id: declId, init } = def.node
      if (declId.type === 'Identifier' && isFunctionNode(init)) return 'function'
      if (init.type !== 'CallExpression' || init.callee.type !== 'Identifier') return null

      if (
        declId.type === 'Identifier' &&
        matchImport(['createMemo', 'children'], init.callee.name)
      ) {
        return 'accessor'
      }
      if (
        declId.type === 'ArrayPattern' &&
        declId.elements[0]?.type === 'Identifier' &&
        declId.elements[0].name === id.name &&
        matchImport(['createSignal', 'createOptimistic'], init.callee.name)
      ) {
        return 'accessor'
      }
      return null
    }

    return {
      ImportDeclaration: handleImportDeclaration,
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return
        const attribute = node.name.name
        if (FUNCTION_ATTRIBUTES.has(attribute) || isOnPrefixed(attribute)) return

        const element = node.parent as T.JSXOpeningElement
        if (
          element.name.type !== 'JSXIdentifier' ||
          !isDOMElementName(element.name.name) ||
          element.name.name.includes('-')
        ) {
          return
        }

        if (node.value?.type !== 'JSXExpressionContainer') return
        const expression = node.value.expression

        if (isFunctionNode(expression)) {
          context.report({ node: expression, messageId: 'functionAsProp', data: { attribute } })
          return
        }

        if (expression.type === 'Identifier') {
          const kind = resolveFunctionKind(expression)
          if (kind === 'accessor') {
            context.report({
              node: expression,
              messageId: 'accessorAsProp',
              data: { attribute, name: expression.name },
              suggest: [
                {
                  messageId: 'accessorAsProp',
                  data: { attribute, name: expression.name },
                  fix: (fixer) => fixer.insertTextAfter(expression, '()'),
                },
              ],
            })
          } else if (kind === 'function') {
            context.report({
              node: expression,
              messageId: 'functionAsProp',
              data: { attribute },
              suggest: [
                {
                  messageId: 'functionAsProp',
                  data: { attribute },
                  fix: (fixer) => fixer.insertTextAfter(expression, '()'),
                },
              ],
            })
          }
        }
      },
    }
  },
})
