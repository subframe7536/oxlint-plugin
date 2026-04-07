import type { Context, ESTree, Fix, Fixer, Reference, Scope, Variable } from '@oxlint/plugins'

// ==================== Type helpers ====================

// In oxlint's ESTree:
// - Function$1 (exported as Function) represents both FunctionDeclaration and FunctionExpression
// - ArrowFunctionExpression is separate
// - All Identifier variants have type: "Identifier" with a name property
// - All literal variants (StringLiteral, NumericLiteral, etc.) have type: "Literal"
// - ObjectProperty has type: "Property"
// - RestElement has type: "RestElement"
// - StaticMemberExpression / ComputedMemberExpression (NOT MemberExpression)

export type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression

export type ProgramOrFunctionNode = FunctionNode | ESTree.Program

const FUNCTION_TYPES = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']
const PROGRAM_OR_FUNCTION_TYPES = ['Program'].concat(FUNCTION_TYPES)

export const isFunctionNode = (node: ESTree.Node | null | undefined): node is FunctionNode =>
  !!node && FUNCTION_TYPES.includes(node.type)

export const isProgramOrFunctionNode = (
  node: ESTree.Node | null | undefined,
): node is ProgramOrFunctionNode => !!node && PROGRAM_OR_FUNCTION_TYPES.includes(node.type)

export const isJSXElementOrFragment = (
  node: ESTree.Node | null | undefined,
): node is ESTree.JSXElement | ESTree.JSXFragment =>
  node?.type === 'JSXElement' || node?.type === 'JSXFragment'

// ==================== Name helpers ====================

const domElementRegex = /^[a-z]/
export const isDOMElementName = (name: string): boolean => domElementRegex.test(name)

const propsRegex = /[pP]rops/
export const isPropsByName = (name: string): boolean => propsRegex.test(name)

export const getFunctionName = (node: FunctionNode): string | null => {
  if (node.type !== 'ArrowFunctionExpression' && node.id != null) {
    return node.id.name
  }
  const parent = node.parent as ESTree.Node | undefined
  if (parent?.type === 'VariableDeclarator') {
    const decl = parent as ESTree.VariableDeclarator
    if (decl.id.type === 'Identifier') {
      return (decl.id as ESTree.IdentifierReference).name
    }
  }
  return null
}

export const formatList = (strings: string[]): string => {
  if (strings.length === 0) {
    return ''
  }
  if (strings.length === 1) {
    return `'${strings[0]}'`
  }
  if (strings.length === 2) {
    return `'${strings[0]}' and '${strings[1]}'`
  }
  const last = strings.length - 1
  return `${strings
    .slice(0, last)
    .map((s) => `'${s}'`)
    .join(', ')}, and '${strings[last]}'`
}

// ==================== Scope helpers ====================

export function findVariable(
  context: Context,
  node: ESTree.Node & { name: string },
): Variable | null {
  const scope = context.sourceCode.getScope(node)
  let current: Scope | null = scope
  while (current) {
    const variable = current.set.get(node.name)
    if (variable) {
      return variable
    }
    current = current.upper
  }
  return null
}

// ==================== AST traversal ====================

const VISITOR_KEYS: Record<string, string[]> = {
  Program: ['body'],
  FunctionDeclaration: ['id', 'params', 'body'],
  FunctionExpression: ['id', 'params', 'body'],
  ArrowFunctionExpression: ['params', 'body'],
  BlockStatement: ['body'],
  ExpressionStatement: ['expression'],
  IfStatement: ['test', 'consequent', 'alternate'],
  ReturnStatement: ['argument'],
  VariableDeclaration: ['declarations'],
  VariableDeclarator: ['id', 'init'],
  CallExpression: ['callee', 'arguments'],
  NewExpression: ['callee', 'arguments'],
  StaticMemberExpression: ['object', 'property'],
  ComputedMemberExpression: ['object', 'property'],
  AssignmentExpression: ['left', 'right'],
  BinaryExpression: ['left', 'right'],
  LogicalExpression: ['left', 'right'],
  UnaryExpression: ['argument'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  ArrayExpression: ['elements'],
  ObjectExpression: ['properties'],
  Property: ['key', 'value'],
  SpreadElement: ['argument'],
  TemplateLiteral: ['quasis', 'expressions'],
  TaggedTemplateExpression: ['tag', 'quasi'],
  JSXElement: ['openingElement', 'children', 'closingElement'],
  JSXFragment: ['openingFragment', 'children', 'closingFragment'],
  JSXOpeningElement: ['name', 'attributes'],
  JSXAttribute: ['name', 'value'],
  JSXSpreadAttribute: ['argument'],
  JSXExpressionContainer: ['expression'],
  Identifier: [],
  Literal: [],
}

interface TraverseVisitor {
  enter?: (node: ESTree.Node) => 'skip' | void
  fallback?: 'iteration'
}

export function traverseNode(node: ESTree.Node, visitor: TraverseVisitor): void {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return

  const result = visitor.enter?.(node)
  if (result === 'skip') return

  const keys =
    VISITOR_KEYS[node.type] ??
    (visitor.fallback === 'iteration'
      ? Object.keys(node).filter(
          (k) => !['type', 'range', 'loc', 'start', 'end', 'parent'].includes(k),
        )
      : [])

  for (const key of keys) {
    const child = (node as unknown as Record<string, unknown>)[key]
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && 'type' in c) {
          traverseNode(c as ESTree.Node, visitor)
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      traverseNode(child as ESTree.Node, visitor)
    }
  }
}

// ==================== Tree walking helpers ====================

export function findParent<Guard extends ESTree.Node>(
  node: ESTree.Node,
  predicate: (node: ESTree.Node) => node is Guard,
): Guard | null
export function findParent(
  node: ESTree.Node,
  predicate: (node: ESTree.Node) => boolean,
): ESTree.Node | null
export function findParent(
  node: ESTree.Node,
  predicate: (node: ESTree.Node) => boolean,
): ESTree.Node | null {
  let current = node.parent as ESTree.Node | null | undefined
  while (current) {
    if (predicate(current)) return current
    current = current.parent as ESTree.Node | null | undefined
  }
  return null
}

export function findInScope(
  node: ESTree.Node,
  scope: ProgramOrFunctionNode,
  predicate: (node: ESTree.Node) => boolean,
): ESTree.Node | null {
  let current: ESTree.Node | null | undefined = node
  while (current) {
    if (current === scope) return predicate(node) ? node : null
    if (predicate(current)) return current
    current = current.parent as ESTree.Node | null | undefined
  }
  return null
}

export function ignoreTransparentWrappers(node: ESTree.Node, up = false): ESTree.Node {
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSSatisfiesExpression'
  ) {
    const next = up ? node.parent : node.expression
    if (next) {
      return ignoreTransparentWrappers(next, up)
    }
  }
  return node
}

// ==================== JSX helpers ====================

export function jsxPropName(prop: ESTree.JSXAttribute): string {
  if (prop.name.type === 'JSXNamespacedName') {
    return `${prop.name.namespace.name}:${prop.name.name.name}`
  }
  return (prop.name as ESTree.JSXIdentifier).name
}

type JSXAttributes = ESTree.JSXOpeningElement['attributes']

export function* jsxGetAllProps(props: JSXAttributes): Generator<[string, ESTree.Node]> {
  for (const attr of props) {
    if (attr.type === 'JSXSpreadAttribute' && attr.argument.type === 'ObjectExpression') {
      for (const property of (attr.argument as ESTree.ObjectExpression).properties) {
        if (property.type === 'Property') {
          const objProp = property as ESTree.ObjectProperty
          if (objProp.key.type === 'Identifier') {
            yield [(objProp.key as ESTree.IdentifierName).name, objProp.key]
          } else if (objProp.key.type === 'Literal') {
            const val = (objProp.key as { value: unknown }).value
            if (typeof val === 'string') {
              yield [val, objProp.key]
            }
          }
        }
      }
    } else if (attr.type === 'JSXAttribute') {
      yield [jsxPropName(attr), attr.name]
    }
  }
}

// ==================== Static value evaluation ====================

export function getStaticStringValue(node: ESTree.Node): string | null {
  if (node.type === 'Literal') {
    const value = node.value
    return typeof value === 'string' ? value : null
  }
  return null
}

// ==================== Import tracking ====================

export function trackImports(fromModule: RegExp = /^solid-js(?:\/?|\b)/) {
  const importMap = new Map<string, string>()

  const handleImportDeclaration = (node: ESTree.ImportDeclaration): void => {
    const src = node.source
    const srcVal = src.type === 'Literal' ? src.value : ''
    if (!fromModule.test(srcVal)) return

    for (const specifier of node.specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        const imported = specifier.imported
        const importedName =
          imported.type === 'Identifier'
            ? imported.name
            : imported.type === 'Literal'
              ? imported.value
              : ''
        const localName = specifier.local.name
        importMap.set(importedName, localName)
      }
    }
  }

  const matchImport = (imports: string | string[], str: string): string | undefined => {
    const importArr = Array.isArray(imports) ? imports : [imports]
    return importArr.find((i) => importMap.get(i) === str)
  }

  return { matchImport, handleImportDeclaration }
}

// ==================== Fixer helpers ====================

export function appendImports(
  fixer: Fixer,
  sourceCode: Context['sourceCode'],
  importNode: ESTree.ImportDeclaration,
  identifiers: string[],
): Fix | null {
  const identifiersString = identifiers.join(', ')
  const reversedSpecifiers = [...importNode.specifiers].reverse()
  const lastSpecifier = reversedSpecifiers.find((s) => s.type === 'ImportSpecifier')
  if (lastSpecifier) {
    return fixer.insertTextAfter(lastSpecifier, `, ${identifiersString}`)
  }
  const otherSpecifier = importNode.specifiers.find(
    (s) => s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier',
  )
  if (otherSpecifier) {
    return fixer.insertTextAfter(otherSpecifier, `, { ${identifiersString} }`)
  }
  if (importNode.specifiers.length === 0) {
    const tokens = sourceCode.getFirstTokens(importNode, { count: 2 })
    const [importToken, maybeBrace] = tokens
    if (maybeBrace?.value === '{') {
      return fixer.insertTextAfter(maybeBrace, ` ${identifiersString} `)
    } else {
      return importToken
        ? fixer.insertTextAfter(importToken, ` { ${identifiersString} } from`)
        : null
    }
  }
  return null
}

export function insertImports(
  fixer: Fixer,
  sourceCode: Context['sourceCode'],
  source: string,
  identifiers: string[],
  aboveImport?: ESTree.ImportDeclaration,
  isType = false,
): Fix {
  const identifiersString = identifiers.join(', ')
  const program = sourceCode.ast

  const firstImport =
    aboveImport ??
    (program.body.find((n) => n.type === 'ImportDeclaration') as
      | ESTree.ImportDeclaration
      | undefined)
  if (firstImport) {
    return fixer.insertTextBeforeRange(
      firstImport.range,
      `import ${isType ? 'type ' : ''}{ ${identifiersString} } from "${source}";\n`,
    )
  }
  return fixer.insertTextBeforeRange(
    [0, 0],
    `import ${isType ? 'type ' : ''}{ ${identifiersString} } from "${source}";\n`,
  )
}

export function removeSpecifier(
  fixer: Fixer,
  sourceCode: Context['sourceCode'],
  specifier: ESTree.ImportSpecifier,
  pure = true,
): Fix {
  const declaration = specifier.parent as ESTree.ImportDeclaration
  if (declaration.specifiers.length === 1 && pure) {
    return fixer.remove(declaration)
  }
  const maybeComma = sourceCode.getTokenAfter(specifier)
  if (maybeComma?.value === ',') {
    return fixer.removeRange([specifier.range[0], maybeComma.range[1]])
  }
  return fixer.remove(specifier)
}

// ==================== Trace helpers ====================

export function trace(node: ESTree.Node, context: Context): ESTree.Node {
  if (node.type === 'Identifier') {
    const variable = findVariable(context, node)
    if (!variable) return node

    const def = variable.defs[0]
    switch (def?.type) {
      case 'FunctionName':
      case 'ClassName':
      case 'ImportBinding':
        return def.node
      case 'Variable': {
        const isConst =
          (def.node.parent as ESTree.VariableDeclaration | undefined)?.kind === 'const' ||
          variable.references.every((ref) => ref.init || ref.isReadOnly())
        if (isConst && def.node.type === 'VariableDeclarator') {
          const declarator = def.node as ESTree.VariableDeclarator
          if (declarator.id.type === 'Identifier' && declarator.init) {
            return trace(declarator.init as ESTree.Node, context)
          }
        }
        break
      }
    }
  }
  return node
}

export type { Reference }
