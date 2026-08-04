import type { Context, ESTree, Rule } from '@oxlint/plugins'

function isFunctionInitializer(
  node: ESTree.Node | null | undefined,
): node is ESTree.ArrowFunctionExpression | ESTree.Function {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression'
}

function getText(context: Context, node: ESTree.Node): string {
  return context.sourceCode.text.slice(node.range[0], node.range[1])
}

export const topLevelFunctionRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce top-level functions to be declared with function keyword',
      url: 'https://github.com/antfu/eslint-plugin-antfu/blob/main/src/rules/top-level-function.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      topLevelFunctionDeclaration: 'Top-level functions should be declared with function keyword',
    },
  },
  createOnce(context) {
    return {
      VariableDeclaration(node) {
        if (node.parent.type !== 'Program' && node.parent.type !== 'ExportNamedDeclaration') return
        if (node.declarations.length !== 1 || node.kind !== 'const' || node.declare) return

        const declaration = node.declarations[0]
        if (!declaration || !isFunctionInitializer(declaration.init)) return
        if (declaration.id.type !== 'Identifier' || declaration.id.typeAnnotation) return

        const functionExpression = declaration.init
        const body = functionExpression.body
        if (!body) return
        if (body.type !== 'BlockStatement' && declaration.id.loc.start.line === body.loc.end.line) {
          return
        }

        context.report({
          node,
          loc: {
            start: declaration.id.loc.start,
            end: body.loc.start,
          },
          messageId: 'topLevelFunctionDeclaration',
          fix: (fixer) => {
            const textName = getText(context, declaration.id)
            const textArgs = functionExpression.params.length
              ? context.sourceCode.text.slice(
                  functionExpression.params[0].range[0],
                  functionExpression.params.at(-1)!.range[1],
                )
              : ''
            const textBody =
              body.type === 'BlockStatement'
                ? getText(context, body)
                : `{\n  return ${getText(context, body)}\n}`
            const textGeneric = functionExpression.typeParameters
              ? getText(context, functionExpression.typeParameters)
              : ''
            const textReturn = functionExpression.returnType
              ? getText(context, functionExpression.returnType)
              : ''
            const textAsync = functionExpression.async ? 'async ' : ''

            return fixer.replaceTextRange(
              node.range,
              `${textAsync}function ${textName} ${textGeneric}(${textArgs})${textReturn} ${textBody}`,
            )
          },
        })
      },
    }
  },
}
