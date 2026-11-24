import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule, findVariable } from './utils.ts'
import { getSolidSourceRegex, trackImports } from './utils.ts'

const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
])

export const noStoreMutationOutsideSetterRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow mutating a store's read proxy; store state changes only through the setter's mutable draft.",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-store-mutation-outside-setter.md',
    },
    schema: [],
    messages: {
      mutateStore:
        "'{{name}}' is a store's read proxy, which is read-only; this mutation is silently ignored — no error, no update, the write just vanishes. Mutate the draft inside the setter instead: `{{setter}}(draft => { ... })`.",
      mutateProjection:
        "'{{name}}' is a projection, a read-only derived store. Derive this value inside the projection function instead of mutating the result.",
    },
  },
  defaultOptions: [],
  visitorKeys: [
    'ImportDeclaration',
    'AssignmentExpression',
    'UpdateExpression',
    'UnaryExpression',
    'CallExpression',
  ],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    type Target = { kind: 'store'; setter: string | null } | { kind: 'projection' }

    const resolveTarget = (id: T.Node & { name: string }): Target | null => {
      const def = findVariable(context, id)?.defs[0]
      if (
        !def ||
        def.type !== 'Variable' ||
        def.node.type !== 'VariableDeclarator' ||
        !def.node.init
      )
        return null
      const { id: declId, init } = def.node
      if (init.type !== 'CallExpression' || init.callee.type !== 'Identifier') return null

      if (
        declId.type === 'ArrayPattern' &&
        declId.elements[0]?.type === 'Identifier' &&
        declId.elements[0].name === id.name &&
        matchImport('createStore', init.callee.name)
      ) {
        const setter = declId.elements[1]?.type === 'Identifier' ? declId.elements[1].name : null
        return { kind: 'store', setter }
      }
      if (declId.type === 'Identifier' && matchImport('createProjection', init.callee.name)) {
        return { kind: 'projection' }
      }
      return null
    }

    const baseIdentifier = (node: T.Node): (T.Node & { name: string }) | null => {
      let current: T.Node = node
      while (current.type === 'MemberExpression') current = current.object
      return current.type === 'Identifier' ? current : null
    }

    const checkMutation = (member: T.MemberExpression, reportNode: T.Node) => {
      const base = baseIdentifier(member)
      const target = base && resolveTarget(base)
      if (!target) return
      if (target.kind === 'projection') {
        context.report({
          node: reportNode,
          messageId: 'mutateProjection',
          data: { name: base.name },
        })
      } else {
        context.report({
          node: reportNode,
          messageId: 'mutateStore',
          data: { name: base.name, setter: target.setter ?? 'setStore' },
        })
      }
    }

    return {
      ImportDeclaration: handleImportDeclaration,
      AssignmentExpression(node) {
        if (node.left.type === 'MemberExpression') checkMutation(node.left, node)
      },
      UpdateExpression(node) {
        if (node.argument.type === 'MemberExpression') checkMutation(node.argument, node)
      },
      UnaryExpression(node) {
        if (node.operator === 'delete' && node.argument.type === 'MemberExpression') {
          checkMutation(node.argument, node)
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          MUTATING_METHODS.has(node.callee.property.name)
        ) {
          checkMutation(node.callee, node)
        }
      },
    }
  },
})
