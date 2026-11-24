import type { ESTree, Rule } from '@oxlint/plugins'
import { appendImports, formatList, insertImports, isDOMElementName, isSolidV2 } from './utils.ts'

const AUTO_COMPONENTS = ['Show', 'For', 'Index', 'Switch', 'Match']
const AUTO_COMPONENTS_V2 = [
  'For',
  'Repeat',
  'Show',
  'Switch',
  'Match',
  'Errored',
  'Loading',
  'Reveal',
]
const SOURCE_MODULE = 'solid-js'

export const jsxNoUndefRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow references to undefined variables in JSX. Handles custom directives.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-undef.md',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowGlobals: {
            type: 'boolean',
            description:
              'When true, the rule will consider the global scope when checking for defined components.',
            default: false,
          },
          autoImport: {
            type: 'boolean',
            description:
              'Automatically import certain components from `"solid-js"` if they are undefined.',
            default: true,
          },
          typescriptEnabled: {
            type: 'boolean',
            description: "Adjusts behavior not to conflict with TypeScript's type checking.",
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      undefined: "'{{identifier}}' is not defined.",
      customDirectiveUndefined: "Custom directive '{{identifier}}' is not defined.",
      autoImport: "{{imports}} should be imported from '{{source}}'.",
    },
  },
  createOnce(context) {
    let allowGlobals = false
    let autoImport = true
    let isTypeScriptEnabled = false
    let autoComponents = AUTO_COMPONENTS
    let missingComponentsSet: Set<string>

    function checkIdentifierInJSX(
      node: ESTree.IdentifierReference | ESTree.JSXIdentifier,
      {
        isComponent,
        isCustomDirective,
      }: { isComponent?: boolean; isCustomDirective?: boolean } = {},
    ) {
      let scope = context.sourceCode.getScope(node)
      const sourceType = context.sourceCode.ast.sourceType
      const scopeUpperBound = !allowGlobals && sourceType === 'module' ? 'module' : 'global'
      const variables = [...scope.variables]

      if (node.name === 'this') {
        return
      }

      while (scope.type !== scopeUpperBound && scope.type !== 'global' && scope.upper) {
        scope = scope.upper
        variables.push(...scope.variables)
      }
      if (scope.childScopes.length) {
        variables.push(...scope.childScopes[0].variables)
        if (scope.childScopes[0].childScopes.length) {
          variables.push(...scope.childScopes[0].childScopes[0].variables)
        }
      }

      if (variables.find((variable) => variable.name === node.name)) {
        return
      }

      if (
        isComponent &&
        autoImport &&
        autoComponents.includes(node.name) &&
        !missingComponentsSet.has(node.name)
      ) {
        missingComponentsSet.add(node.name)
      } else if (isCustomDirective) {
        context.report({
          node,
          messageId: 'customDirectiveUndefined',
          data: {
            identifier: node.name,
          },
        })
      } else if (!isTypeScriptEnabled) {
        context.report({
          node,
          messageId: 'undefined',
          data: {
            identifier: node.name,
          },
        })
      }
    }

    return {
      before() {
        const opts =
          (
            context.options as [
              {
                allowGlobals?: boolean
                autoImport?: boolean
                typescriptEnabled?: boolean
              }?,
            ]
          )[0] ?? {}
        allowGlobals = opts.allowGlobals ?? false
        autoImport = opts.autoImport !== false
        isTypeScriptEnabled = opts.typescriptEnabled ?? false
        autoComponents = isSolidV2(context) ? AUTO_COMPONENTS_V2 : AUTO_COMPONENTS
        missingComponentsSet = new Set<string>()
      },
      JSXOpeningElement(node) {
        switch (node.name.type) {
          case 'JSXIdentifier':
            if (!isDOMElementName(node.name.name)) {
              checkIdentifierInJSX(node.name, { isComponent: true })
            }
            break
          case 'JSXMemberExpression': {
            let n: ESTree.JSXMemberExpressionObject = node.name.object
            while (n.type === 'JSXMemberExpression') {
              n = (n as ESTree.JSXMemberExpression).object
            }
            if (n.type === 'JSXIdentifier') {
              checkIdentifierInJSX(n)
            }
            break
          }
          default:
            break
        }
      },
      'JSXAttribute > JSXNamespacedName'(node: ESTree.JSXNamespacedName) {
        if (
          node.namespace?.type === 'JSXIdentifier' &&
          node.namespace.name === 'use' &&
          node.name?.type === 'JSXIdentifier'
        ) {
          checkIdentifierInJSX(node.name, { isCustomDirective: true })
        }
      },
      'Program:exit'(programNode) {
        const missingComponents = Array.from(missingComponentsSet.values())
        if (autoImport && missingComponents.length) {
          const importNode = programNode.body.find(
            (n) =>
              n.type === 'ImportDeclaration' &&
              n.importKind !== 'type' &&
              n.source.type === 'Literal' &&
              n.source.value === SOURCE_MODULE,
          ) as ESTree.ImportDeclaration | undefined
          if (importNode) {
            context.report({
              node: importNode,
              messageId: 'autoImport',
              data: {
                imports: formatList(missingComponents),
                source: SOURCE_MODULE,
              },
              fix: (fixer) =>
                appendImports(fixer, context.sourceCode, importNode, missingComponents),
            })
          } else {
            context.report({
              node: programNode,
              messageId: 'autoImport',
              data: {
                imports: formatList(missingComponents),
                source: SOURCE_MODULE,
              },
              fix: (fixer) =>
                insertImports(fixer, context.sourceCode, SOURCE_MODULE, missingComponents),
            })
          }
        }
      },
    }
  },
}
