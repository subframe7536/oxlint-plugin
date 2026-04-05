import type { Rule, ESTree, Fixer, Fix } from '@oxlint/plugins'
import type { FunctionNode } from './utils.ts'

function getName(node: ESTree.Node): string | null {
  switch (node.type) {
    case 'Literal': {
      const v = (node as { value: unknown }).value
      return typeof v === 'string' ? v : null
    }
    case 'Identifier':
      return (node as ESTree.IdentifierReference).name
    case 'AssignmentPattern':
      return getName((node as ESTree.AssignmentPattern).left as ESTree.Node)
    default:
      return null
  }
}

interface PropertyInfo {
  real: ESTree.Node
  varName: string
  computed: boolean
  init: ESTree.Node | undefined
}

function getPropertyInfo(prop: ESTree.ObjectProperty): PropertyInfo | null {
  const value = prop.value as ESTree.Node
  const varName = getName(value)
  if (varName !== null) {
    return {
      real: prop.key,
      varName,
      computed: prop.computed,
      init: value.type === 'AssignmentPattern' ? (value as ESTree.AssignmentPattern).right as ESTree.Node : undefined,
    }
  }
  return null
}

export const noDestructureRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow destructuring props. In Solid, props must be used with property accesses (`props.foo`) to preserve reactivity. This rule only tracks destructuring in the parameter list.",
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-destructure.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noDestructure:
        "Destructuring component props breaks Solid's reactivity; use property access instead.",
    },
  },
  create(context) {
    const functionStack: Array<{ hasJSX: boolean }> = []
    const currentFunction = () => functionStack[functionStack.length - 1]

    const onFunctionEnter = () => {
      functionStack.push({ hasJSX: false })
    }

    const onFunctionExit = (node: ESTree.Node) => {
      const funcNode = node as FunctionNode
      if (funcNode.params.length === 1) {
        const props = funcNode.params[0]
        if (
          props &&
          props.type === 'ObjectPattern' &&
          currentFunction().hasJSX &&
          funcNode.parent?.type !== 'JSXExpressionContainer'
        ) {
          context.report({
            node: props,
            messageId: 'noDestructure',
            fix: (fixer) => [...fixDestructure(funcNode, props as ESTree.ObjectPattern, fixer)],
          })
        }
      }
      functionStack.pop()
    }

    function* fixDestructure(
      func: FunctionNode,
      props: ESTree.ObjectPattern,
      fixer: Fixer,
    ): Generator<Fix> {
      const propsName = 'props'
      const properties = props.properties
      const propertyInfo: PropertyInfo[] = []
      let rest: { argument: ESTree.Node } | null = null

      for (const property of properties) {
        if (property.type === 'RestElement') {
          rest = property as { argument: ESTree.Node }
        } else if (property.type === 'Property') {
          const info = getPropertyInfo(property as ESTree.ObjectProperty)
          if (info !== null) {
            propertyInfo.push(info)
          }
        }
      }

      const hasDefaults = propertyInfo.some((info) => info.init)
      const origProps = !(hasDefaults || rest) ? propsName : '_' + propsName

      // Replace the destructured parameter
      const typeAnnotation = (props as { typeAnnotation?: ESTree.Node }).typeAnnotation
      if (typeAnnotation) {
        yield fixer.replaceTextRange([props.range[0], typeAnnotation.range[0]], origProps)
      } else {
        yield fixer.replaceText(props, origProps)
      }

      const sourceCode = context.sourceCode

      const defaultsObjectString = () =>
        propertyInfo
          .filter((info) => info.init)
          .map((info) => {
            const keyText = sourceCode.getText(info.real)
            return `${info.computed ? '[' : ''}${keyText}${info.computed ? ']' : ''}: ${sourceCode.getText(info.init!)}`
          })
          .join(', ')

      const splitPropsArray = () =>
        `[${propertyInfo
          .map((info) =>
            info.real.type === 'Identifier'
              ? JSON.stringify((info.real as ESTree.IdentifierReference).name)
              : sourceCode.getText(info.real),
          )
          .join(', ')}]`

      let lineToInsert = ''
      const restArg = rest?.argument
      const restName =
        restArg && restArg.type === 'Identifier'
          ? (restArg as ESTree.IdentifierReference).name
          : null

      if (hasDefaults && rest) {
        lineToInsert = `  const [${propsName}, ${restName ?? 'rest'}] = splitProps(mergeProps({ ${defaultsObjectString()} }, ${origProps}), ${splitPropsArray()});`
      } else if (hasDefaults) {
        lineToInsert = `  const ${propsName} = mergeProps({ ${defaultsObjectString()} }, ${origProps});\n`
      } else if (rest) {
        lineToInsert = `  const [${propsName}, ${restName ?? 'rest'}] = splitProps(${origProps}, ${splitPropsArray()});\n`
      }

      if (lineToInsert) {
        const body = func.body
        if (!body) return
        if (body.type === 'BlockStatement') {
          const blockBody = (body as ESTree.FunctionBody).body
          if (blockBody.length > 0) {
            yield fixer.insertTextBefore(blockBody[0]!, lineToInsert)
          }
        } else {
          // Arrow function with expression body
          const maybeOpenParen = sourceCode.getTokenBefore(body as ESTree.Node)
          if (maybeOpenParen?.value === '(') {
            yield fixer.remove(maybeOpenParen)
          }
          const maybeCloseParen = sourceCode.getTokenAfter(body as ESTree.Node)
          if (maybeCloseParen?.value === ')') {
            yield fixer.remove(maybeCloseParen)
          }
          yield fixer.insertTextBefore(body as ESTree.Node, `{\n${lineToInsert}  return (`)
          yield fixer.insertTextAfter(body as ESTree.Node, `);\n}`)
        }
      }

      // Replace destructured variable usages with props accesses
      const funcScope = sourceCode.scopeManager?.acquire(func as ESTree.Node)
      if (funcScope) {
        for (const info of propertyInfo) {
          const variable = funcScope.set.get(info.varName)
          if (variable) {
            for (const reference of variable.references) {
              if (reference.isReadOnly()) {
                const access =
                  info.real.type === 'Identifier' && !info.computed
                    ? `.${(info.real as ESTree.IdentifierReference).name}`
                    : `[${sourceCode.getText(info.real)}]`
                yield fixer.replaceText(reference.identifier, `${propsName}${access}`)
              }
            }
          }
        }
      }
    }

    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      'FunctionDeclaration:exit': onFunctionExit,
      'FunctionExpression:exit': onFunctionExit,
      'ArrowFunctionExpression:exit': onFunctionExit,
      JSXElement() {
        if (functionStack.length) currentFunction().hasJSX = true
      },
      JSXFragment() {
        if (functionStack.length) currentFunction().hasJSX = true
      },
    }
  },
}
