import type { Rule, ESTree } from '@oxlint/plugins'
import { getFunctionName, type FunctionNode } from './utils.ts'

type ReturnStatement = ESTree.ReturnStatement

function isNothing(node?: ESTree.Node): boolean {
  if (!node) return true
  if (node.type === 'Literal') {
    const val = (node as { value: unknown }).value
    return val === false || val === null || val === undefined || val === ''
  }
  if (node.type === 'JSXFragment') {
    const frag = node as ESTree.JSXFragment
    return !frag.children || frag.children.every(isNothing)
  }
  return false
}

function getLineLength(loc: ESTree.Node['loc']): number {
  if (!loc) return 0
  return loc.end.line - loc.start.line + 1
}

export const componentsReturnOnceRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow early returns in components. Solid components only run once, and so conditionals should be inside JSX.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/components-return-once.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noEarlyReturn:
        'Solid components run once, so an early return breaks reactivity. Move the condition inside a JSX element, such as a fragment or <Show />.',
      noConditionalReturn:
        'Solid components run once, so a conditional return breaks reactivity. Move the condition inside a JSX element, such as a fragment or <Show />.',
    },
  },
  create(context) {
    const functionStack: Array<{
      isComponent: boolean
      lastReturn: ReturnStatement | undefined
      earlyReturns: ReturnStatement[]
    }> = []

    const putIntoJSX = (node: ESTree.Node): string => {
      const text = context.sourceCode.getText(node)
      return node.type === 'JSXElement' || node.type === 'JSXFragment' ? text : `{${text}}`
    }

    const currentFunction = () => functionStack[functionStack.length - 1]

    const onFunctionEnter = (node: FunctionNode) => {
      let lastReturn: ReturnStatement | undefined
      if (node.body?.type === 'BlockStatement') {
        const body = (node.body as ESTree.FunctionBody).body
        const last = [...body].reverse().find((n) => !n.type.endsWith('Declaration'))
        if (last?.type === 'ReturnStatement') {
          lastReturn = last as ReturnStatement
        }
      }
      functionStack.push({ isComponent: false, lastReturn, earlyReturns: [] })
    }

    const onFunctionExit = (node: FunctionNode) => {
      const name = getFunctionName(node)
      if (
        (name && /^[a-z]/.test(name)) ||
        node.parent?.type === 'JSXExpressionContainer' ||
        (node.parent?.type === 'CallExpression' &&
          (node.parent as ESTree.CallExpression).arguments.some((n) => n === node) &&
          (node.parent as ESTree.CallExpression).callee.type === 'Identifier' &&
          !/^[A-Z]/.test(
            ((node.parent as ESTree.CallExpression).callee as ESTree.IdentifierReference).name,
          ))
      ) {
        currentFunction().isComponent = false
      }

      if (currentFunction().isComponent) {
        for (const earlyReturn of currentFunction().earlyReturns) {
          context.report({ node: earlyReturn, messageId: 'noEarlyReturn' })
        }

        const argument = currentFunction().lastReturn?.argument
        if (argument?.type === 'ConditionalExpression') {
          const sourceCode = context.sourceCode
          context.report({
            node: argument.parent!,
            messageId: 'noConditionalReturn',
            fix: (fixer) => {
              const condArg = argument as ESTree.ConditionalExpression
              const conditions: Array<{ test: ESTree.Node; consequent: ESTree.Node }> = [
                { test: condArg.test, consequent: condArg.consequent },
              ]
              let fallback: ESTree.Node = condArg.alternate

              while (fallback.type === 'ConditionalExpression') {
                const nested = fallback as ESTree.ConditionalExpression
                conditions.push({ test: nested.test, consequent: nested.consequent })
                fallback = nested.alternate
              }

              if (conditions.length >= 2) {
                const fallbackStr = !isNothing(fallback)
                  ? ` fallback={${sourceCode.getText(fallback)}}`
                  : ''
                return fixer.replaceText(
                  argument,
                  `<Switch${fallbackStr}>\n${conditions
                    .map(
                      ({ test, consequent }) =>
                        `<Match when={${sourceCode.getText(test)}}>${putIntoJSX(consequent)}</Match>`,
                    )
                    .join('\n')}\n</Switch>`,
                )
              }

              const { test, consequent } = conditions[0]!
              const fallbackNode = fallback

              if (isNothing(consequent)) {
                return fixer.replaceText(
                  argument,
                  `<Show when={!(${sourceCode.getText(test)})}>${putIntoJSX(fallbackNode)}</Show>`,
                )
              }
              if (
                isNothing(fallbackNode) ||
                getLineLength(consequent.loc) >= getLineLength(fallbackNode.loc) * 1.5
              ) {
                const fallbackStr = !isNothing(fallbackNode)
                  ? ` fallback={${sourceCode.getText(fallbackNode)}}`
                  : ''
                return fixer.replaceText(
                  argument,
                  `<Show when={${sourceCode.getText(test)}}${fallbackStr}>${putIntoJSX(consequent)}</Show>`,
                )
              }
              return fixer.replaceText(argument, `<>${putIntoJSX(argument)}</>`)
            },
          })
        } else if (argument?.type === 'LogicalExpression') {
          const logExpr = argument as ESTree.LogicalExpression
          if (logExpr.operator === '&&') {
            const sourceCode = context.sourceCode
            context.report({
              node: argument,
              messageId: 'noConditionalReturn',
              fix: (fixer) =>
                fixer.replaceText(
                  argument,
                  `<Show when={${sourceCode.getText(logExpr.left)}}>${putIntoJSX(logExpr.right)}</Show>`,
                ),
            })
          } else {
            context.report({ node: argument, messageId: 'noConditionalReturn' })
          }
        }
      }

      functionStack.pop()
    }

    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      'FunctionDeclaration:exit': onFunctionExit,
      'FunctionExpression:exit': onFunctionExit,
      'ArrowFunctionExpression:exit': onFunctionExit,
      JSXElement() {
        if (functionStack.length) currentFunction().isComponent = true
      },
      JSXFragment() {
        if (functionStack.length) currentFunction().isComponent = true
      },
      ReturnStatement(node) {
        if (functionStack.length && node !== currentFunction().lastReturn) {
          currentFunction().earlyReturns.push(node)
        }
      },
    }
  },
}
