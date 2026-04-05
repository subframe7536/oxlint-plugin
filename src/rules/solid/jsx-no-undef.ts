import type { Rule, ESTree, Scope } from '@oxlint/plugins'
import { isDOMElementName, formatList, appendImports, insertImports } from './utils.ts'

const AUTO_COMPONENTS = ['Show', 'For', 'Index', 'Switch', 'Match']
const SOURCE_MODULE = 'solid-js'

export const jsxNoUndefRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow references to undefined variables in JSX. Handles custom directives.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-undef.md',
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
  create(context) {
    const options =
      (context.options as [
        { allowGlobals?: boolean; autoImport?: boolean; typescriptEnabled?: boolean }?,
      ])[0] ?? {}
    const allowGlobals = options.allowGlobals ?? false
    const autoImport = options.autoImport !== false
    const isTypeScriptEnabled = options.typescriptEnabled ?? false

    const missingComponentsSet = new Set<string>()

    function isDefinedInScope(name: string, node: ESTree.Node): boolean {
      let scope: Scope | null = context.sourceCode.getScope(node)
      const sourceType = (context.sourceCode.ast as ESTree.Program).sourceType
      const stopAt = !allowGlobals && sourceType === 'module' ? 'module' : 'global'

      while (scope) {
        if (scope.set.has(name)) return true
        if (scope.type === stopAt || scope.type === 'global') break
        scope = scope.upper
      }
      // Also check global scope
      if (allowGlobals) {
        let gs: Scope | null = context.sourceCode.getScope(node)
        while (gs?.upper) gs = gs.upper
        if (gs?.set.has(name)) return true
      }
      return false
    }

    function checkIdentifierInJSX(
      node: ESTree.Node & { name: string },
      opts: { isComponent?: boolean; isCustomDirective?: boolean } = {},
    ) {
      const name = node.name
      if (name === 'this') return

      if (isDefinedInScope(name, node)) return

      if (opts.isComponent && autoImport && AUTO_COMPONENTS.includes(name) && !missingComponentsSet.has(name)) {
        missingComponentsSet.add(name)
      } else if (opts.isCustomDirective) {
        context.report({
          node,
          messageId: 'customDirectiveUndefined',
          data: { identifier: name },
        })
      } else if (!isTypeScriptEnabled) {
        context.report({
          node,
          messageId: 'undefined',
          data: { identifier: name },
        })
      }
    }

    return {
      JSXOpeningElement(node) {
        switch (node.name.type) {
          case 'JSXIdentifier':
            if (!isDOMElementName((node.name as ESTree.JSXIdentifier).name)) {
              checkIdentifierInJSX(node.name as ESTree.JSXIdentifier & { name: string }, {
                isComponent: true,
              })
            }
            break
          case 'JSXMemberExpression': {
            let n: ESTree.JSXMemberExpressionObject = node.name.object
            while (n.type === 'JSXMemberExpression') {
              n = (n as ESTree.JSXMemberExpression).object
            }
            if (n.type === 'JSXIdentifier') {
              checkIdentifierInJSX(n as ESTree.JSXIdentifier & { name: string })
            }
            break
          }
          default:
            break
        }
      },
      'JSXAttribute > JSXNamespacedName': (node: ESTree.Node) => {
        const nsNode = node as ESTree.JSXNamespacedName
        if (
          nsNode.namespace?.type === 'JSXIdentifier' &&
          (nsNode.namespace as ESTree.JSXIdentifier).name === 'use' &&
          nsNode.name?.type === 'JSXIdentifier'
        ) {
          checkIdentifierInJSX(nsNode.name as ESTree.JSXIdentifier & { name: string }, {
            isCustomDirective: true,
          })
        }
      },
      'Program:exit': (programNode: ESTree.Node) => {
        const program = programNode as ESTree.Program
        const missingComponents = Array.from(missingComponentsSet.values())
        if (autoImport && missingComponents.length) {
          const importNode = program.body.find(
            (n) =>
              n.type === 'ImportDeclaration' &&
              (n as { importKind?: string }).importKind !== 'type' &&
              (n as ESTree.ImportDeclaration).source.type === 'Literal' &&
              ((n as ESTree.ImportDeclaration).source as { value: unknown }).value === SOURCE_MODULE,
          ) as ESTree.ImportDeclaration | undefined

          if (importNode) {
            context.report({
              node: importNode,
              messageId: 'autoImport',
              data: { imports: formatList(missingComponents), source: SOURCE_MODULE },
              fix: (fixer) => appendImports(fixer, context.sourceCode, importNode, missingComponents),
            })
          } else {
            context.report({
              node: programNode,
              messageId: 'autoImport',
              data: { imports: formatList(missingComponents), source: SOURCE_MODULE },
              fix: (fixer) => insertImports(fixer, context.sourceCode, 'solid-js', missingComponents),
            })
          }
        }
      },
    }
  },
}
