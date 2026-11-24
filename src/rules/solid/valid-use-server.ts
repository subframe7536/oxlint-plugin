import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule } from './utils.ts'
import {
  findParent,
  isFunctionNode,
  trackImports,
  createNameMatcher,
  getDirectivePrologue,
  getUseServerEligibility,
  isInsideUseServerFunction,
  programHasUseServerDirective,
} from './utils.ts'

const POSITION_LABELS = {
  objectMethod: 'an object method',
  accessor: 'a getter or setter',
  classMethod: 'a class method',
} as const

const CLIENT_WRAPPERS = ['GET', 'live', 'withMeta', 'query', 'action', 'liveQuery']
const WRAPPER_SOURCES = /^(?:solid-js|@solidjs\/(?:web|router|start))(?:\/|$)/

const isDefinitelyNotFunction = (node: T.Node): boolean =>
  node.type === 'Literal' ||
  node.type === 'TemplateLiteral' ||
  node.type === 'ArrayExpression' ||
  node.type === 'ObjectExpression'

export const validUseServerRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that "use server" directives are placed where the compiler honors them, and that module-level directive files export working server functions.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/valid-use-server.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          clientWrappers: {
            description:
              "Additional function names treated as client-side declaration wrappers that must not be called inside a module-level \"use server\" file. Supports exact names, '*' wildcards, and regexes given as '/pattern/' strings. GET, live, withMeta, query, action, and liveQuery are always included.",
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      misplacedDirective:
        'The "use server" directive only takes effect as the first statement of a function body or module; here it is an ordinary expression statement and the code stays on the client.',
      templateDirective:
        'A template literal is never a directive; this code stays on the client. Use a plain string: "use server".',
      ineligiblePosition:
        'The "use server" directive in {{position}} is silently ignored — the function is never extracted to the server. Use a standalone function, a function-valued property, or a block-bodied arrow instead.',
      nonFunctionExport:
        'Every export of a module-level "use server" file is registered as a server function; \'{{name}}\' is not a function and will fail the server at boot. Move non-function exports to another module.',
      clientWrapper:
        'In a module-level "use server" file the client receives bare server references, so \'{{name}}\' never runs on the client and its behavior is silently lost. Wrap the imported server function in a shared module instead, or move the directive inside the wrapped function.',
    },
  },
  defaultOptions: [{ clientWrappers: [] }],
  visitorKeys: [
    'Program',
    'ImportDeclaration',
    'ExpressionStatement',
    'ExportNamedDeclaration',
    'ExportDefaultDeclaration',
    'CallExpression',
  ],
  create(context, [options]) {
    const { matchImport, handleImportDeclaration } = trackImports(WRAPPER_SOURCES)
    const matchesCustomWrapper = createNameMatcher(options.clientWrappers)
    let moduleLevel = false

    const checkExportedValue = (node: T.Node, name: string) => {
      if (isDefinitelyNotFunction(node)) {
        context.report({ node, messageId: 'nonFunctionExport', data: { name } })
      }
    }

    return {
      Program(node) {
        moduleLevel = programHasUseServerDirective(node)
      },
      ImportDeclaration: handleImportDeclaration,
      ExpressionStatement(node) {
        const { expression } = node
        const isTemplate =
          expression.type === 'TemplateLiteral' &&
          expression.expressions.length === 0 &&
          expression.quasis.length === 1 &&
          expression.quasis[0].value.cooked === 'use server'
        const isString = expression.type === 'Literal' && expression.value === 'use server'
        if (!isTemplate && !isString) return

        if (isTemplate) {
          context.report({ node, messageId: 'templateDirective' })
          return
        }

        if (moduleLevel) return
        const nearestFunction = findParent(node, isFunctionNode)
        if (
          nearestFunction &&
          isFunctionNode(nearestFunction) &&
          isInsideUseServerFunction(nearestFunction)
        ) {
          return
        }

        const parent = node.parent
        const enclosingFunction =
          parent?.type === 'BlockStatement' && isFunctionNode(parent.parent) ? parent.parent : null
        if (
          parent?.type !== 'Program' &&
          (parent?.type !== 'BlockStatement' || !enclosingFunction)
        ) {
          context.report({ node, messageId: 'misplacedDirective' })
          return
        }

        const body = parent.body
        if (!getDirectivePrologue(body).includes(node)) {
          context.report({ node, messageId: 'misplacedDirective' })
          return
        }

        if (enclosingFunction && !isInsideUseServerFunction(enclosingFunction)) {
          const eligibility = getUseServerEligibility(enclosingFunction)
          if (eligibility !== 'eligible') {
            context.report({
              node,
              messageId: 'ineligiblePosition',
              data: { position: POSITION_LABELS[eligibility] },
            })
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (!moduleLevel || !node.declaration) return
        if (node.declaration.type === 'VariableDeclaration') {
          for (const declarator of node.declaration.declarations) {
            if (declarator.init && declarator.id.type === 'Identifier') {
              checkExportedValue(declarator.init, declarator.id.name)
            }
          }
        }
      },
      ExportDefaultDeclaration(node) {
        if (!moduleLevel) return
        checkExportedValue(node.declaration, 'default')
      },
      CallExpression(node) {
        if (!moduleLevel || node.callee.type !== 'Identifier') return
        if (findParent(node, isFunctionNode) != null) return
        const name = node.callee.name
        if (matchImport(CLIENT_WRAPPERS, name) || matchesCustomWrapper(name)) {
          context.report({ node, messageId: 'clientWrapper', data: { name } })
        }
      },
    }
  },
})
