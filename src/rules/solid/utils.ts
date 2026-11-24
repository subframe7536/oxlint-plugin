import type { Context, ESTree, Fix, Fixer, Reference, Rule, Scope, Variable } from '@oxlint/plugins'

// ==================== Type helpers ====================

// In oxlint's ESTree:
// - Function$1 (exported as Function) represents both FunctionDeclaration and FunctionExpression
// - ArrowFunctionExpression is separate
// - All Identifier variants have type: "Identifier" with a name property
// - All literal variants (StringLiteral, NumericLiteral, etc.) have type: "Literal"
// - ObjectProperty has type: "Property"
// - RestElement has type: "RestElement"
// - Runtime MemberExpression has type: "MemberExpression" (typed as StaticMemberExpression | ComputedMemberExpression)

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

// ==================== Solid settings helpers ====================

interface HasSettings {
  settings?: Record<string, unknown>
}

/**
 * Read the targeted Solid version from `settings: { solid: { version: 2 } }`.
 * Returns the major version number, or `null` when unset — meaning rules should
 * use permissive dual-version behavior (accept both 1.x and 2.x patterns).
 */
export function getSolidVersion(context: HasSettings): number | null {
  const solidSettings = context.settings?.solid
  if (solidSettings && typeof solidSettings === 'object' && 'version' in solidSettings) {
    const version = (solidSettings as { version: unknown }).version
    if (typeof version === 'number' && Number.isInteger(version) && version > 0) {
      return version
    }
    if (typeof version === 'string') {
      const major = Number.parseInt(version, 10)
      if (Number.isInteger(major) && major > 0) return major
    }
  }
  return null
}

/** Whether the targeted Solid version is 2.x or later. */
export const isSolidV2 = (context: HasSettings): boolean => (getSolidVersion(context) ?? 0) >= 2

const DEFAULT_SOURCE_REGEX =
  /^(?:solid-js(?:\/?|\b)|@solidjs\/signals(?:\/?|\b)|@solidjs\/web(?:\/?|\b))/

/**
 * The module sources whose exports are treated as Solid's primitives. Custom
 * renderers and re-exporting wrappers can register their own module names via
 * `settings.solid.moduleSources`.
 */
export const getSolidSourceRegex = (context: HasSettings): RegExp => {
  const solidSettings = context.settings?.solid
  const raw =
    solidSettings && typeof solidSettings === 'object' && 'moduleSources' in solidSettings
      ? (solidSettings as { moduleSources: unknown }).moduleSources
      : undefined
  if (!Array.isArray(raw)) return DEFAULT_SOURCE_REGEX
  const escaped = raw
    .filter((source): source is string => typeof source === 'string')
    .map((source) => source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!escaped.length) return DEFAULT_SOURCE_REGEX
  return new RegExp(`${DEFAULT_SOURCE_REGEX.source}|^(?:${escaped.join('|')})$`)
}

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

/**
 * Compiles a list of user-provided name patterns into a matcher. Entries may
 * be exact names, glob-ish patterns using `*` wildcards ("watch*"), or
 * regexes written as "/pattern/" strings.
 */
export const createNameMatcher = (patterns: string[]): ((name: string) => boolean) => {
  const matchers: (string | RegExp)[] = patterns.map((entry) => {
    if (entry.length > 2 && entry.startsWith('/') && entry.endsWith('/')) {
      try {
        return new RegExp(entry.slice(1, -1))
      } catch {
        return entry
      }
    }
    if (entry.includes('*')) {
      const escaped = entry
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[a-zA-Z0-9_$]*')
      return new RegExp(`^${escaped}$`)
    }
    return entry
  })
  return (name: string): boolean =>
    matchers.some((matcher) =>
      typeof matcher === 'string' ? matcher === name : matcher.test(name),
    )
}

// ==================== Scope helpers ====================

export function findVariableInScope(
  initialScope: Scope | null | undefined,
  nameOrNode: string | (ESTree.Node & { name: string }),
): Variable | null {
  const name = typeof nameOrNode === 'string' ? nameOrNode : nameOrNode.name
  let current: Scope | null | undefined = initialScope
  while (current) {
    const variable = current.set.get(name)
    if (variable) {
      return variable
    }
    current = current.upper
  }
  return null
}

export function findVariable(
  context: Context,
  node: ESTree.Node & { name: string },
): Variable | null {
  return findVariableInScope(context.sourceCode.getScope(node), node)
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
  MemberExpression: ['object', 'property'],
  StaticMemberExpression: ['object', 'property'],
  ComputedMemberExpression: ['object', 'property'],
  ChainExpression: ['expression'],
  AssignmentExpression: ['left', 'right'],
  BinaryExpression: ['left', 'right'],
  LogicalExpression: ['left', 'right'],
  UnaryExpression: ['argument'],
  UpdateExpression: ['argument'],
  ConditionalExpression: ['test', 'consequent', 'alternate'],
  SequenceExpression: ['expressions'],
  AwaitExpression: ['argument'],
  YieldExpression: ['argument'],
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
  TSAsExpression: ['expression'],
  TSSatisfiesExpression: ['expression'],
  TSNonNullExpression: ['expression'],
  TSTypeAssertion: ['expression'],
  Identifier: [],
  Literal: [],
}

interface TraverseVisitor {
  enter?: (node: ESTree.Node) => 'skip' | 'break' | void
  fallback?: 'iteration'
}

export function traverseNode(node: ESTree.Node, visitor: TraverseVisitor): boolean {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return false

  const result = visitor.enter?.(node)
  if (result === 'break') return true
  if (result === 'skip') return false

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
          if (traverseNode(c as ESTree.Node, visitor)) return true
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      if (traverseNode(child as ESTree.Node, visitor)) return true
    }
  }
  return false
}

// ==================== Tree walking helpers ====================

export const find = (
  node: ESTree.Node,
  predicate: (node: ESTree.Node) => boolean,
): ESTree.Node | null => {
  let n: ESTree.Node | null | undefined = node
  while (n) {
    if (predicate(n)) return n
    n = n.parent as ESTree.Node | null | undefined
  }
  return null
}

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
  return node.parent ? find(node.parent as ESTree.Node, predicate) : null
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
      return ignoreTransparentWrappers(next as ESTree.Node, up)
    }
  }
  return node
}

// ==================== Comment & location helpers ====================

export const getCommentBefore = (
  node: ESTree.Node,
  sourceCode: Context['sourceCode'],
): ESTree.Comment | undefined =>
  sourceCode
    .getCommentsBefore(node)
    .find((comment) => comment.loc && node.loc && comment.loc.end.line >= node.loc.start.line - 1)

export const getCommentAfter = (
  node: ESTree.Node,
  sourceCode: Context['sourceCode'],
): ESTree.Comment | undefined =>
  sourceCode
    .getCommentsAfter(node)
    .find((comment) => comment.loc && node.loc && comment.loc.start.line === node.loc.end.line)

export function getFunctionHeadLocation(
  node: FunctionNode,
  sourceCode: Context['sourceCode'],
): ESTree.Node['loc'] {
  const parent = node.parent as ESTree.Node | undefined
  let start = node.loc.start
  let end = node.loc.end

  if (node.type === 'ArrowFunctionExpression') {
    const arrowToken = sourceCode.getTokenBefore(node.body, (t) => t.value === '=>')
    if (arrowToken) {
      start = arrowToken.loc.start
      end = arrowToken.loc.end
    }
  } else if (
    parent?.type === 'Property' &&
    ((parent as ESTree.ObjectProperty).method || (parent as ESTree.ObjectProperty).kind !== 'init')
  ) {
    start = parent.loc.start
    const openParen = node.body
      ? sourceCode.getFirstTokenBetween(
          (parent as ESTree.ObjectProperty).key,
          node.body,
          (t) => t.value === '(',
        )
      : null
    if (openParen) end = openParen.loc.start
  } else if (parent?.type === 'MethodDefinition') {
    start = parent.loc.start
    const openParen = node.body
      ? sourceCode.getFirstTokenBetween(
          (parent as ESTree.MethodDefinition).key,
          node.body,
          (t) => t.value === '(',
        )
      : null
    if (openParen) end = openParen.loc.start
  } else {
    const openParen = sourceCode.getFirstToken(node, (t) => t.value === '(')
    if (openParen) end = openParen.loc.start
  }

  return { start, end }
}

// ==================== Directive / Server Function helpers ====================

export const getDirectivePrologue = (body: ESTree.Statement[]): ESTree.ExpressionStatement[] => {
  const prologue: ESTree.ExpressionStatement[] = []
  for (const statement of body) {
    if (
      statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'Literal' &&
      typeof (statement.expression as { value: unknown }).value === 'string'
    ) {
      prologue.push(statement)
    } else {
      break
    }
  }
  return prologue
}

const prologueHasDirective = (body: ESTree.Statement[], directive: string): boolean =>
  getDirectivePrologue(body).some(
    (statement) => (statement.expression as ESTree.StringLiteral).value === directive,
  )

export const hasUseServerDirective = (fn: FunctionNode): boolean =>
  fn.body?.type === 'BlockStatement' && prologueHasDirective(fn.body.body, 'use server')

export const programHasUseServerDirective = (program: ESTree.Program): boolean =>
  prologueHasDirective(program.body as ESTree.Statement[], 'use server')

export type UseServerEligibility = 'eligible' | 'objectMethod' | 'accessor' | 'classMethod'

export const getUseServerEligibility = (fn: FunctionNode): UseServerEligibility => {
  const parent = fn.parent as ESTree.Node | undefined
  if (parent?.type === 'Property' && (parent as ESTree.ObjectProperty).value === fn) {
    const prop = parent as ESTree.ObjectProperty
    if (prop.kind !== 'init') return 'accessor'
    if (prop.method) return 'objectMethod'
  }
  if (parent?.type === 'MethodDefinition') {
    const method = parent as ESTree.MethodDefinition
    return method.kind === 'get' || method.kind === 'set' ? 'accessor' : 'classMethod'
  }
  return 'eligible'
}

export const isInsideUseServerFunction = (fn: FunctionNode): boolean => {
  let parent = findParent(fn, isFunctionNode)
  while (parent) {
    if (isFunctionNode(parent) && hasUseServerDirective(parent)) return true
    parent = findParent(parent, isFunctionNode)
  }
  return false
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
            if (val != null) {
              yield [String(val), objProp.key]
            }
          }
        }
      }
    } else if (attr.type === 'JSXAttribute') {
      yield [jsxPropName(attr), attr.name]
    }
  }
}

export function jsxHasProp(props: JSXAttributes, prop: string): boolean {
  for (const [p] of jsxGetAllProps(props)) {
    if (p === prop) return true
  }
  return false
}

export function jsxGetProp(props: JSXAttributes, prop: string): ESTree.JSXAttribute | undefined {
  return props.find(
    (attribute) => attribute.type !== 'JSXSpreadAttribute' && prop === jsxPropName(attribute),
  ) as ESTree.JSXAttribute | undefined
}

// ==================== Static value evaluation ====================

export function getStaticValue(
  node: ESTree.Node | null | undefined,
  initialScope?: Scope | null,
): { value: unknown } | null {
  if (!node) return null
  switch (node.type) {
    case 'Literal': {
      const lit = node as { value: unknown; regex?: unknown }
      if ('regex' in lit && lit.regex) return null
      return { value: lit.value }
    }
    case 'TemplateLiteral': {
      const tpl = node as ESTree.TemplateLiteral
      if (tpl.expressions.length === 0) {
        return { value: tpl.quasis[0]?.value.cooked ?? tpl.quasis[0]?.value.raw ?? '' }
      }
      let out = tpl.quasis[0]?.value.cooked ?? tpl.quasis[0]?.value.raw ?? ''
      for (let i = 0; i < tpl.expressions.length; i++) {
        const exprVal = getStaticValue(tpl.expressions[i], initialScope)
        if (!exprVal) return null
        out += String(exprVal.value)
        out += tpl.quasis[i + 1]?.value.cooked ?? tpl.quasis[i + 1]?.value.raw ?? ''
      }
      return { value: out }
    }
    case 'UnaryExpression': {
      const u = node as ESTree.UnaryExpression
      const arg = getStaticValue(u.argument, initialScope)
      if (!arg) return null
      switch (u.operator) {
        case '!':
          return { value: !arg.value }
        case '+':
          return { value: +(arg.value as number) }
        case '-':
          return { value: -(arg.value as number) }
        case '~':
          return { value: ~(arg.value as number) }
        case 'typeof':
          return { value: typeof arg.value }
        case 'void':
          return { value: undefined }
        default:
          return null
      }
    }
    case 'BinaryExpression': {
      const b = node as ESTree.BinaryExpression
      const left = getStaticValue(b.left, initialScope)
      const right = getStaticValue(b.right, initialScope)
      if (!left || !right) return null
      if (b.operator === '+') {
        if (typeof left.value === 'string' || typeof right.value === 'string') {
          return { value: String(left.value) + String(right.value) }
        }
        if (typeof left.value === 'number' && typeof right.value === 'number') {
          return { value: left.value + right.value }
        }
      }
      return null
    }
    case 'Identifier': {
      const id = node as ESTree.IdentifierReference
      if (id.name === 'undefined') return { value: undefined }
      if (initialScope) {
        const variable = findVariableInScope(initialScope, id.name)
        if (variable && variable.defs.length === 1) {
          const def = variable.defs[0]
          if (
            def.type === 'Variable' &&
            (def.node.parent as ESTree.VariableDeclaration | undefined)?.kind === 'const' &&
            def.node.type === 'VariableDeclarator' &&
            def.node.id.type === 'Identifier' &&
            def.node.init
          ) {
            return getStaticValue(def.node.init, initialScope)
          }
        }
      }
      return null
    }
    default:
      return null
  }
}

export function getStringIfConstant(
  node: ESTree.Node | null | undefined,
  initialScope?: Scope | null,
): string | null {
  const evaluated = getStaticValue(node, initialScope)
  if (!evaluated) return null
  if (typeof evaluated.value === 'string') return evaluated.value
  if (typeof evaluated.value === 'number' || typeof evaluated.value === 'boolean') {
    return String(evaluated.value)
  }
  return null
}

export function getStaticStringValue(node: ESTree.Node): string | null {
  if (node.type === 'Literal') {
    const value = (node as { value: unknown }).value
    return typeof value === 'string' ? value : null
  }
  return null
}

export function getPropertyName(
  node: ESTree.MemberExpression | ESTree.ObjectProperty | ESTree.MethodDefinition,
  initialScope?: Scope | null,
): string | null {
  if (node.type === 'MemberExpression') {
    if (!node.computed) {
      return node.property.type === 'Identifier' ? node.property.name : null
    }
    return getStringIfConstant(node.property, initialScope)
  }
  if (!node.computed) {
    if (node.key.type === 'Identifier') return node.key.name
    if (node.key.type === 'Literal') {
      const val = (node.key as { value: unknown }).value
      return val != null ? String(val) : null
    }
    return null
  }
  return getStringIfConstant(node.key, initialScope)
}

// ==================== Import tracking ====================

export function trackImports(fromModule: RegExp = DEFAULT_SOURCE_REGEX) {
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
  const namespaceSpecifier = importNode.specifiers.find(
    (s) => s.type === 'ImportNamespaceSpecifier',
  )
  if (namespaceSpecifier) {
    const typePrefix = importNode.importKind === 'type' ? 'type ' : ''
    const rawSource =
      (importNode.source as { raw?: string }).raw ?? JSON.stringify(importNode.source.value)
    return fixer.insertTextAfter(
      importNode,
      `\nimport ${typePrefix}{ ${identifiersString} } from ${rawSource};`,
    )
  }
  const otherSpecifier = importNode.specifiers.find((s) => s.type === 'ImportDefaultSpecifier')
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
      (getCommentBefore(firstImport, sourceCode) ?? firstImport).range,
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

export type CompatContext = Context

export function getSourceCode(context: Context): Context['sourceCode'] {
  return context.sourceCode
}

export function getScope(context: Context, node: ESTree.Node): Scope {
  return context.sourceCode.getScope(node)
}

export function markVariableAsUsed(context: Context, name: string, node: ESTree.Node): void {
  const sc = context.sourceCode as unknown as {
    markVariableAsUsed?: (name: string, node: ESTree.Node) => boolean
  }
  if (typeof sc.markVariableAsUsed === 'function') {
    sc.markVariableAsUsed(name, node)
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v != null && !Array.isArray(v)

function deepMergeOptions(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
): Record<string, unknown> {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)])
  return Object.fromEntries(
    [...keys].map((key) => {
      const a = first[key]
      const b = second[key]
      if (key in first && key in second) {
        return [key, isPlainObject(a) && isPlainObject(b) ? deepMergeOptions(a, b) : b]
      }
      return [key, key in first ? a : b]
    }),
  )
}

function applyDefaultOptions(
  defaultOptions: readonly unknown[],
  userOptions: readonly unknown[],
): unknown[] {
  const options = structuredClone(defaultOptions) as unknown[]
  options.forEach((option, i) => {
    const userOption = userOptions?.[i]
    if (userOption !== undefined) {
      options[i] =
        isPlainObject(userOption) && isPlainObject(option)
          ? deepMergeOptions(option, userOption)
          : userOption
    }
  })
  return options
}

export function createOnceRule<Opts extends readonly unknown[] = []>(config: {
  meta: Rule['meta']
  defaultOptions?: Opts
  visitorKeys: readonly string[]
  create: (
    context: Context,
    options: Opts,
  ) => Record<string, ((...args: any[]) => void) | undefined>
}): Rule {
  return {
    meta: config.meta,
    createOnce(context) {
      let current: Record<string, ((...args: any[]) => void) | undefined> = {}
      const visitor: Record<string, any> = {
        before() {
          const opts = config.defaultOptions
            ? (applyDefaultOptions(config.defaultOptions, context.options) as unknown as Opts)
            : (context.options as unknown as Opts)
          current = config.create(context, opts)
        },
      }
      for (const key of config.visitorKeys) {
        visitor[key] = (...args: unknown[]) => {
          current[key]?.(...args)
        }
      }
      return visitor
    },
  }
}
