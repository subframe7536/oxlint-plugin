import type { ESTree as T } from '@oxlint/plugins'
import { getSolidSourceRegex, trackImports } from './utils.ts'
import { createOnceRule, findVariableInScope, getScope } from './utils.ts'

const JSX_PROP_DEFAULTS: Record<string, Record<string, boolean>> = {
  For: { keyed: true },
  Show: { keyed: false },
  Match: { keyed: false },
}

export const noRestatedDefaultOptionsRule = createOnceRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow restating a prop or option value that is already the default.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-restated-default-options.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      restatedDefault:
        'Passing `{{prop}}={{{value}}}` restates the default for `<{{component}}>`; omit it.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'JSXAttribute'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))
    return {
      ImportDeclaration: handleImportDeclaration,
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier') return
        const element = node.parent as T.JSXOpeningElement
        if (element.name.type !== 'JSXIdentifier') return

        let componentName = matchImport(Object.keys(JSX_PROP_DEFAULTS), element.name.name)
        if (
          !componentName &&
          element.name.name in JSX_PROP_DEFAULTS &&
          findVariableInScope(getScope(context, element), element.name.name) == null
        ) {
          componentName = element.name.name
        }
        if (!componentName) return
        const defaults = JSX_PROP_DEFAULTS[componentName]
        const prop = node.name.name
        if (!(prop in defaults)) return
        const defaultValue = defaults[prop]

        let stated: boolean | null = null
        if (node.value == null) {
          stated = true
        } else if (
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Literal' &&
          typeof node.value.expression.value === 'boolean'
        ) {
          stated = node.value.expression.value
        }

        if (stated === defaultValue) {
          context.report({
            node,
            messageId: 'restatedDefault',
            data: { prop, value: String(stated), component: element.name.name },
            fix: (fixer) => fixer.remove(node),
          })
        }
      },
    }
  },
})
