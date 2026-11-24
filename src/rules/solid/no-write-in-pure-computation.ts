import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule, findVariable } from './utils.ts'
import {
  type FunctionNode,
  findParent,
  getFunctionName,
  isFunctionNode,
  getSolidSourceRegex,
  trackImports,
} from './utils.ts'

export const noWriteInPureComputationRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow writing signals or stores inside `createMemo`, the compute half of `createEffect`, or a component body, which are pure owned scopes.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-write-in-pure-computation.md',
    },
    schema: [],
    messages: {
      writeInMemo:
        "Calling the setter '{{name}}' inside {{api}} makes the computation impure and creates an update cycle. Derive the value instead of storing it, or move the write to an effect.",
      writeInCompute:
        "Calling the setter '{{name}}' in the compute half of {{api}} — the compute function is tracked and must be pure. Move the write into the effect half (the second argument).",
      writeInComponent:
        "Calling the setter '{{name}}' during component setup — the body runs once as a pure owned scope, and Solid 2.0 throws on setup writes in dev. Initialize the state with the right value instead, or move the write into an effect half or event handler.",
    },
  },
  defaultOptions: [],
  visitorKeys: [
    'ImportDeclaration',
    ':function',
    'JSXElement',
    'JSXFragment',
    ':function:exit',
    'CallExpression',
  ],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))
    const computations = new Map<T.Node, { messageId: string; api: string }>()

    const allowsOwnedWrite = (init: T.CallExpression): boolean => {
      let options: T.Node | undefined = init.arguments[1]
      if (!options) return false
      if (options.type === 'Identifier') {
        const variable = findVariable(context, options)
        const def = variable?.defs[0]
        if (
          variable?.defs.length !== 1 ||
          def?.type !== 'Variable' ||
          def.node.type !== 'VariableDeclarator' ||
          def.node.parent?.type !== 'VariableDeclaration' ||
          def.node.parent.kind !== 'const' ||
          !def.node.init ||
          variable.references.some(
            (ref) =>
              ref.identifier !== (def.node as T.VariableDeclarator).id &&
              !(
                ref.identifier.parent?.type === 'CallExpression' &&
                ref.identifier.parent.arguments[1] === ref.identifier
              ),
          )
        ) {
          return true
        }
        options = def.node.init
      }
      if (!options || options.type !== 'ObjectExpression') return true
      return options.properties.some(
        (property) =>
          property.type === 'SpreadElement' ||
          ((property.key.type === 'Identifier'
            ? property.key.name === 'ownedWrite'
            : property.key.type === 'Literal' && property.key.value === 'ownedWrite') &&
            !(property.value.type === 'Literal' && property.value.value === false)),
      )
    }

    const isSetter = (id: T.Node & { name: string }): boolean => {
      const def = findVariable(context, id)?.defs[0]
      if (
        !def ||
        def.type !== 'Variable' ||
        def.node.type !== 'VariableDeclarator' ||
        !def.node.init
      )
        return false
      const { id: declId, init } = def.node
      if (
        declId.type !== 'ArrayPattern' ||
        declId.elements[1]?.type !== 'Identifier' ||
        declId.elements[1].name !== id.name ||
        init.type !== 'CallExpression' ||
        init.callee.type !== 'Identifier'
      ) {
        return false
      }
      const primitive = matchImport(
        ['createSignal', 'createStore', 'createOptimistic'],
        init.callee.name,
      )
      if (!primitive) return false
      if (primitive !== 'createStore' && allowsOwnedWrite(init)) return false
      return true
    }

    const pendingComponentWrites = new Map<FunctionNode, T.CallExpression[]>()
    const functionStack: Array<{ hasJSX: boolean }> = []

    const isComponent = (node: FunctionNode) =>
      !getFunctionName(node)?.match(/^[a-z]/) &&
      node.parent?.type !== 'JSXExpressionContainer' &&
      !(
        node.parent?.type === 'CallExpression' &&
        node.parent.arguments.includes(node as T.Expression) &&
        !(node.parent.callee as T.Node & { name: string }).name?.match(/^[A-Z]/)
      )

    return {
      ImportDeclaration: handleImportDeclaration,
      ':function'() {
        functionStack.push({ hasJSX: false })
      },
      JSXElement() {
        if (functionStack.length) functionStack[functionStack.length - 1].hasJSX = true
      },
      JSXFragment() {
        if (functionStack.length) functionStack[functionStack.length - 1].hasJSX = true
      },
      ':function:exit'(node: T.Node) {
        const { hasJSX } = functionStack.pop() ?? { hasJSX: false }
        if (!isFunctionNode(node)) return
        const pending = pendingComponentWrites.get(node)
        if (!pending) return
        pendingComponentWrites.delete(node)
        if (!hasJSX || computations.has(node) || !isComponent(node)) return
        for (const call of pending) {
          context.report({
            node: call,
            messageId: 'writeInComponent',
            data: { name: (call.callee as T.Node & { name: string }).name },
          })
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return

        const memoName = matchImport(['createMemo', 'createDeferred'], node.callee.name)
        if (memoName) {
          const fn = node.arguments[0]
          if (isFunctionNode(fn)) {
            computations.set(fn, { messageId: 'writeInMemo', api: memoName })
          }
          return
        }
        const effectName = matchImport(['createEffect', 'createRenderEffect'], node.callee.name)
        if (effectName && node.arguments.length >= 2) {
          const fn = node.arguments[0]
          if (isFunctionNode(fn)) {
            computations.set(fn, { messageId: 'writeInCompute', api: effectName })
          }
          return
        }

        const enclosing = findParent(node, isFunctionNode)
        if (!enclosing || !isFunctionNode(enclosing)) return
        const computation = computations.get(enclosing)
        if (!computation && !isSetter(node.callee)) return
        if (computation) {
          if (isSetter(node.callee)) {
            context.report({
              node,
              messageId: computation.messageId,
              data: { name: node.callee.name, api: computation.api },
            })
          }
          return
        }
        const pending = pendingComponentWrites.get(enclosing)
        if (pending) pending.push(node)
        else pendingComponentWrites.set(enclosing, [node])
      },
    }
  },
})
