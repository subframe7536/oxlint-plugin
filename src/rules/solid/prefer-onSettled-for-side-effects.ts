import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule } from './utils.ts'
import {
  findParent,
  getFunctionName,
  isFunctionNode,
  isJSXElementOrFragment,
  type FunctionNode,
} from './utils.ts'

const TIMER_CALLS = new Set(['setInterval', 'setTimeout'])
const OBSERVER_CONSTRUCTORS = new Set([
  'IntersectionObserver',
  'ResizeObserver',
  'MutationObserver',
  'PerformanceObserver',
])
const LISTENER_TARGETS = new Set(['window', 'document'])

const isComponentLike = (fn: FunctionNode): boolean => {
  const name = getFunctionName(fn)
  if (name && /^[A-Z]/.test(name)) return true
  if (fn.type === 'ArrowFunctionExpression' && isJSXElementOrFragment(fn.body)) return true
  if (fn.body?.type === 'BlockStatement') {
    return fn.body.body.some(
      (statement) =>
        statement.type === 'ReturnStatement' && isJSXElementOrFragment(statement.argument),
    )
  }
  return false
}

export const preferOnSettledForSideEffectsRule = createOnceRule({
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce running side-effectful setup (timers, global listeners, observers) inside `onSettled` instead of the component body.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/prefer-onSettled-for-side-effects.md',
    },
    schema: [],
    messages: {
      sideEffectInBody:
        '{{name}} in the component body runs during setup, including on the server during SSR. Move it into `onSettled(() => { ...; return cleanup; })` so it runs client-side once the DOM has settled.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['CallExpression', 'NewExpression'],
  create(context) {
    const report = (node: T.Node, name: string) => {
      const enclosingFunction = findParent(node, isFunctionNode)
      if (!enclosingFunction || !isComponentLike(enclosingFunction)) return
      context.report({ node, messageId: 'sideEffectInBody', data: { name } })
    }

    return {
      CallExpression(node) {
        const { callee } = node
        if (callee.type === 'Identifier' && TIMER_CALLS.has(callee.name)) {
          report(node, `\`${callee.name}\``)
        } else if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'addEventListener' &&
          callee.object.type === 'Identifier' &&
          LISTENER_TARGETS.has(callee.object.name)
        ) {
          report(node, `\`${callee.object.name}.addEventListener\``)
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && OBSERVER_CONSTRUCTORS.has(node.callee.name)) {
          report(node, `\`new ${node.callee.name}\``)
        }
      },
    }
  },
})
