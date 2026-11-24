import type { ESTree, Fix, Fixer, Rule } from '@oxlint/plugins'
import { getFunctionName, getStringIfConstant, isSolidV2, type FunctionNode } from './utils.ts'

const getName = (node: ESTree.Node): string | null => {
  switch (node.type) {
    case 'Literal': {
      const val = (node as { value: unknown }).value
      return typeof val === 'string' ? val : null
    }
    case 'Identifier':
      return (node as ESTree.IdentifierReference).name
    case 'AssignmentPattern':
      return getName((node as ESTree.AssignmentPattern).left)
    default:
      return getStringIfConstant(node)
  }
}

interface PropertyInfo {
  real: ESTree.Node
  var: string
  computed: boolean
  init: ESTree.Expression | undefined
}

const getPropertyInfo = (prop: ESTree.BindingProperty): PropertyInfo | null => {
  const valueName = getName(prop.value)
  if (valueName !== null) {
    return {
      real: prop.key,
      var: valueName,
      computed: prop.computed,
      init:
        prop.value.type === 'AssignmentPattern'
          ? (prop.value as ESTree.AssignmentPattern).right
          : undefined,
    }
  }
  return null
}

export const noDestructureRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow destructuring props. In Solid, props must be used with property accesses (`props.foo`) to preserve reactivity. This rule only tracks destructuring in the parameter list.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-destructure.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      noDestructure:
        "Destructuring component props breaks Solid's reactivity; use property access instead.",
    },
  },
  createOnce(context) {
    let functionStack: Array<{ hasJSX: boolean }> = []
    let v2 = false

    const currentFunction = () => functionStack[functionStack.length - 1]
    const onFunctionEnter = () => {
      functionStack.push({ hasJSX: false })
    }

    const isComponent = (node: FunctionNode) => {
      const parent = node.parent as ESTree.Node | undefined
      return (
        !getFunctionName(node)?.match(/^[a-z]/) &&
        parent?.type !== 'JSXExpressionContainer' &&
        !(
          parent?.type === 'CallExpression' &&
          (parent as ESTree.CallExpression).arguments.includes(node as ESTree.Expression) &&
          !((parent as ESTree.CallExpression).callee as { name?: string }).name?.match(/^[A-Z]/)
        )
      )
    }

    const canFixDestructure = (func: FunctionNode, props: ESTree.ObjectPattern): boolean => {
      const destructured = new Set<string>()
      for (const property of props.properties) {
        if (property.type === 'RestElement') {
          if (property.argument.type !== 'Identifier') return false
          destructured.add(property.argument.name)
          continue
        }
        const info = getPropertyInfo(property)
        if (info === null) return false
        destructured.add(info.var)
      }

      const scope = context.sourceCode.scopeManager?.acquire(func)
      if (!scope) return false

      for (const name of destructured) {
        const variable = scope.set.get(name)
        if (
          variable?.references.some(
            (reference) =>
              reference.identifier.range[0] >= props.range[0] &&
              reference.identifier.range[1] <= props.range[1] &&
              !reference.init,
          )
        ) {
          return false
        }
      }

      const introduced = ['props', '_props']
      const conflicts = (name: string): boolean => {
        if (scope.through.some((reference) => reference.identifier.name === name)) return true
        const stack = [scope]
        while (stack.length) {
          const current = stack.pop()!
          for (const variable of current.variables) {
            if (variable.name !== name) continue
            if (current === scope && destructured.has(name)) continue
            if (variable.defs.length === 0) continue
            return true
          }
          stack.push(...current.childScopes)
        }
        return false
      }
      return !introduced.some(conflicts)
    }

    function* importHelpers(fixer: Fixer, names: string[]): Generator<Fix> {
      const program = context.sourceCode.ast
      const solidImport = program.body.find(
        (node): node is ESTree.ImportDeclaration =>
          node.type === 'ImportDeclaration' &&
          node.source.value === 'solid-js' &&
          node.importKind !== 'type' &&
          !node.specifiers.some((s) => s.type === 'ImportNamespaceSpecifier'),
      )
      const imported = new Set(
        solidImport?.specifiers.map((s) =>
          s.type === 'ImportSpecifier'
            ? s.imported.type === 'Identifier'
              ? s.imported.name
              : s.imported.value
            : '',
        ),
      )
      const missing = names.filter((name) => !imported.has(name))
      if (!missing.length) return
      const named = solidImport?.specifiers.filter(
        (s): s is ESTree.ImportSpecifier => s.type === 'ImportSpecifier',
      )
      if (solidImport && named?.length) {
        yield fixer.insertTextAfter(named[named.length - 1], `, ${missing.join(', ')}`)
      } else if (solidImport && solidImport.specifiers.length) {
        yield fixer.insertTextAfter(solidImport.specifiers[0], `, { ${missing.join(', ')} }`)
      } else {
        const imports = program.body.filter((node) => node.type === 'ImportDeclaration')
        const text = `import { ${missing.join(', ')} } from "solid-js";`
        if (imports.length) {
          yield fixer.insertTextAfter(imports[imports.length - 1], `\n${text}`)
        } else {
          yield fixer.insertTextBeforeRange([program.range[0], program.range[0]], `${text}\n`)
        }
      }
    }

    function* fixDestructure(
      func: FunctionNode,
      props: ESTree.ObjectPattern,
      fixer: Fixer,
    ): Generator<Fix> {
      const propsName = 'props'
      const propertyInfo: PropertyInfo[] = []
      let rest: ESTree.BindingRestElement | null = null

      for (const property of props.properties) {
        if (property.type === 'RestElement') {
          rest = property
        } else {
          const info = getPropertyInfo(property)
          if (info === null) continue
          propertyInfo.push(info)
        }
      }

      const hasDefaults = propertyInfo.some((info) => info.init)
      const mergeName = v2 ? 'merge' : 'mergeProps'
      const splitName = v2 ? 'omit' : 'splitProps'
      const helpers = [...(hasDefaults ? [mergeName] : []), ...(rest ? [splitName] : [])]

      const origProps = !(hasDefaults || (rest && !v2)) ? propsName : `_${propsName}`
      if (props.typeAnnotation) {
        const range: [number, number] = [props.range[0], props.typeAnnotation.range[0]]
        yield fixer.replaceTextRange(range, origProps)
      } else {
        yield fixer.replaceText(props, origProps)
      }

      const sourceCode = context.sourceCode

      const defaultsObjectString = () =>
        propertyInfo
          .filter((info) => info.init)
          .map(
            (info) =>
              `${info.computed ? '[' : ''}${sourceCode.getText(info.real)}${
                info.computed ? ']' : ''
              }: ${sourceCode.getText(info.init!)}`,
          )
          .join(', ')

      const splitPropsArray = () =>
        `[${propertyInfo
          .map((info) =>
            info.real.type === 'Identifier'
              ? JSON.stringify((info.real as ESTree.IdentifierName).name)
              : sourceCode.getText(info.real),
          )
          .join(', ')}]`

      const restName = (rest?.argument.type === 'Identifier' && rest.argument.name) || 'rest'
      const omitKeys = () =>
        propertyInfo
          .map((info) =>
            info.real.type === 'Identifier'
              ? JSON.stringify((info.real as ESTree.IdentifierName).name)
              : sourceCode.getText(info.real),
          )
          .join(', ')

      let lineToInsert = ''
      if (v2) {
        if (hasDefaults) {
          lineToInsert += `  const ${propsName} = merge({ ${defaultsObjectString()} }, ${origProps});\n`
        }
        if (rest) {
          lineToInsert += `  const ${restName} = omit(${propsName}${
            propertyInfo.length ? `, ${omitKeys()}` : ''
          });\n`
        }
      } else if (hasDefaults && rest) {
        lineToInsert = `  const [${propsName}, ${restName}] = splitProps(mergeProps({ ${defaultsObjectString()} }, ${origProps}), ${splitPropsArray()});\n`
      } else if (hasDefaults) {
        lineToInsert = `  const ${propsName} = mergeProps({ ${defaultsObjectString()} }, ${origProps});\n`
      } else if (rest) {
        lineToInsert = `  const [${propsName}, ${restName}] = splitProps(${origProps}, ${splitPropsArray()});\n`
      }

      if (lineToInsert) {
        yield* importHelpers(fixer, helpers)
        const body = func.body
        if (body && body.type === 'BlockStatement') {
          if (body.body.length > 0) {
            yield fixer.insertTextBefore(body.body[0], lineToInsert)
          }
        } else if (body) {
          const maybeOpenParen = sourceCode.getTokenBefore(body)
          if (maybeOpenParen?.value === '(') {
            yield fixer.remove(maybeOpenParen)
          }
          const maybeCloseParen = sourceCode.getTokenAfter(body)
          if (maybeCloseParen?.value === ')') {
            yield fixer.remove(maybeCloseParen)
          }
          yield fixer.insertTextBefore(body, `{\n${lineToInsert}  return (`)
          yield fixer.insertTextAfter(body, `);\n}`)
        }
      }

      const scope = sourceCode.scopeManager?.acquire(func)
      if (scope) {
        for (const [info, variable] of propertyInfo.map(
          (info) => [info, scope.set.get(info.var)] as const,
        )) {
          if (variable) {
            for (const reference of variable.references) {
              if (reference.isReadOnly()) {
                const access =
                  info.real.type === 'Identifier' && !info.computed
                    ? `.${(info.real as ESTree.IdentifierName).name}`
                    : `[${sourceCode.getText(info.real)}]`
                yield fixer.replaceText(reference.identifier, `${propsName}${access}`)
              }
            }
          }
        }
      }
    }

    const onFunctionExit = (node: FunctionNode) => {
      if (node.params.length === 1) {
        const props = node.params[0]
        if (props.type === 'ObjectPattern' && currentFunction()?.hasJSX && isComponent(node)) {
          context.report({
            node: props,
            messageId: 'noDestructure',
            fix: canFixDestructure(node, props)
              ? (fixer) => fixDestructure(node, props, fixer)
              : undefined,
          })
        }
      }
      functionStack.pop()
    }

    return {
      before() {
        functionStack = []
        v2 = isSolidV2(context)
      },
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      'FunctionDeclaration:exit': onFunctionExit,
      'FunctionExpression:exit': onFunctionExit,
      'ArrowFunctionExpression:exit': onFunctionExit,
      JSXElement() {
        if (functionStack.length) {
          currentFunction().hasJSX = true
        }
      },
      JSXFragment() {
        if (functionStack.length) {
          currentFunction().hasJSX = true
        }
      },
    }
  },
}
