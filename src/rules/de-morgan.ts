import type { Context, ESTree, FixFn, Rule } from '@oxlint/plugins'

type LogicalOperator = '&&' | '||'
type RuleKind = {
  sourceOperator: LogicalOperator
  targetOperator: LogicalOperator
  messageId: 'convertNegatedConjunction' | 'convertNegatedDisjunction'
  description: string
}

const EQUALITY_COMPLEMENTS: Record<string, string> = {
  '===': '!==',
  '!==': '===',
  '==': '!=',
  '!=': '==',
}

const LOW_PRECEDENCE_EXPRESSIONS = new Set([
  'ArrowFunctionExpression',
  'AssignmentExpression',
  'ConditionalExpression',
  'SequenceExpression',
  'YieldExpression',
])

function isUnaryNegation(node: ESTree.Node | null | undefined): node is ESTree.UnaryExpression {
  return node?.type === 'UnaryExpression' && node.operator === '!'
}

function isLogicalExpression(
  node: ESTree.Node | null | undefined,
): node is ESTree.LogicalExpression {
  return node?.type === 'LogicalExpression'
}

function isBinaryExpression(node: ESTree.Node): node is ESTree.BinaryExpression {
  return node.type === 'BinaryExpression'
}

function hasSameOperator(
  node: ESTree.Node,
  operator: LogicalOperator,
): node is ESTree.LogicalExpression {
  return isLogicalExpression(node) && node.operator === operator
}

function isBooleanLiteral(node: ESTree.Node): node is ESTree.Node & { value: boolean } {
  return (
    node.type === 'Literal' &&
    typeof (node as ESTree.Node & { value?: unknown }).value === 'boolean'
  )
}

/**
 * Parentheses are not represented as AST nodes by oxlint. Token depth lets us
 * distinguish `a && (b || c)` from `a && b || c` without reparsing source text.
 */
function isPureLogicalGroup(node: ESTree.LogicalExpression, context: Context): boolean {
  let depth = 0
  let operator: LogicalOperator | null = null

  for (const token of context.sourceCode.getTokens(node)) {
    if (token.value === '(' || token.value === '[' || token.value === '{') {
      depth++
      continue
    }
    if (token.value === ')' || token.value === ']' || token.value === '}') {
      depth--
      continue
    }
    if (depth !== 0 || (token.value !== '&&' && token.value !== '||')) {
      continue
    }

    const tokenOperator = token.value as LogicalOperator
    if (operator === null) {
      operator = tokenOperator
    } else if (operator !== tokenOperator) {
      return false
    }
  }

  return true
}

/**
 * A nested negation can change a value-producing expression into a non-boolean
 * expression if it is stripped. Match the upstream rule's conservative guard.
 */
function hasRelevantNestedNegation(node: ESTree.Node): boolean {
  let current = node

  while (isUnaryNegation(current) && isUnaryNegation(current.argument)) {
    current = current.argument.argument
  }

  if (isUnaryNegation(current)) {
    return true
  }
  if (!isLogicalExpression(current)) {
    return false
  }

  return hasRelevantNestedNegation(current.left) || hasRelevantNestedNegation(current.right)
}

function hasBooleanContext(node: ESTree.Node): boolean {
  const parent = node.parent
  if (!parent) return false

  if (
    parent.type === 'ConditionalExpression' ||
    parent.type === 'DoWhileStatement' ||
    parent.type === 'ForStatement' ||
    parent.type === 'IfStatement' ||
    parent.type === 'WhileStatement' ||
    parent.type === 'LogicalExpression' ||
    parent.type === 'UnaryExpression'
  ) {
    return parent.type !== 'UnaryExpression' || parent.operator === '!'
  }

  if (isBinaryExpression(parent)) {
    return new Set(['===', '!==', '==', '!=', '<=', '>=', '<', '>', 'in', 'instanceof']).has(
      parent.operator,
    )
  }

  return (
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'Boolean'
  )
}

function isInTruthinessContext(node: ESTree.Node): boolean {
  const parent = node.parent
  if (!parent) return false

  switch (parent.type) {
    case 'ConditionalExpression':
      return parent.test === node || isInTruthinessContext(parent)
    case 'DoWhileStatement':
    case 'ExpressionStatement':
    case 'ForStatement':
    case 'IfStatement':
    case 'WhileStatement':
      return true
    case 'SequenceExpression':
      return parent.expressions.at(-1) !== node || isInTruthinessContext(parent)
    case 'LogicalExpression':
      return parent.operator !== '??' && isInTruthinessContext(parent)
    case 'UnaryExpression':
      return parent.operator === '!'
    default:
      return false
  }
}

function getLogicalSeparator(
  left: ESTree.Node,
  right: ESTree.Node,
  context: Context,
  kind: RuleKind,
): string {
  const text = context.sourceCode.text.slice(left.range[1], right.range[0])
  if (!text) return ` ${kind.targetOperator} `

  const withoutOpeningParens = text.replace(
    /(?:\s*\()+\s*$/u,
    (match) => match.match(/^\s*/u)?.[0] ?? '',
  )
  const withoutClosingParens = withoutOpeningParens.replace(
    /^\s*(?:\)\s*)+/u,
    (match) => match.match(/\s*$/u)?.[0] ?? '',
  )
  return withoutClosingParens.replaceAll(kind.sourceOperator, kind.targetOperator)
}

function negateBinaryExpression(node: ESTree.BinaryExpression, context: Context): string {
  const text = context.sourceCode.getText(node)
  const complement = EQUALITY_COMPLEMENTS[node.operator]
  if (!complement) return `!(${text})`

  const operatorToken = context.sourceCode.getTokenAfter(node.left, {
    filter: (token) => token.value === node.operator,
  })
  if (!operatorToken) return `!(${text})`

  const [nodeStart] = node.range
  const [tokenStart, tokenEnd] = operatorToken.range
  return text.slice(0, tokenStart - nodeStart) + complement + text.slice(tokenEnd - nodeStart)
}

function negateOperand(node: ESTree.Node, context: Context, canStripNegation: boolean): string {
  if (isBooleanLiteral(node)) {
    return node.value ? 'false' : 'true'
  }

  if (isBinaryExpression(node)) {
    return negateBinaryExpression(node, context)
  }

  const text = context.sourceCode.getText(node).trim()
  if (isUnaryNegation(node)) {
    return canStripNegation ? text.slice(1).trim() : `!${text}`
  }
  if (isLogicalExpression(node) || LOW_PRECEDENCE_EXPRESSIONS.has(node.type)) {
    return `!(${text})`
  }
  return `!${text}`
}

function transformLogical(
  node: ESTree.LogicalExpression,
  context: Context,
  kind: RuleKind,
  canStripNegation: boolean,
): string {
  const left = hasSameOperator(node.left, kind.sourceOperator)
    ? transformLogical(node.left, context, kind, canStripNegation)
    : negateOperand(node.left, context, canStripNegation)
  const right = hasSameOperator(node.right, kind.sourceOperator)
    ? transformLogical(node.right, context, kind, canStripNegation)
    : negateOperand(node.right, context, canStripNegation)

  return `${left}${getLogicalSeparator(node.left, node.right, context, kind)}${right}`
}

function isInsideForInitializer(node: ESTree.Node): boolean {
  let current: ESTree.Node = node
  while (
    current.parent &&
    (current.parent.type === 'VariableDeclarator' ||
      current.parent.type === 'VariableDeclaration' ||
      current.parent.type.endsWith('Expression'))
  ) {
    current = current.parent
  }
  return current.parent?.type === 'ForStatement' && current.parent.init === current
}

function needsParentParens(node: ESTree.Node, targetOperator: LogicalOperator): boolean {
  if (isInsideForInitializer(node)) return true

  const parent = node.parent
  if (!parent) return false

  switch (parent.type) {
    case 'AwaitExpression':
    case 'BinaryExpression':
    case 'TaggedTemplateExpression':
    case 'UnaryExpression':
      return true
    case 'LogicalExpression':
      return parent.operator === '??' || (targetOperator === '||' && parent.operator === '&&')
    case 'CallExpression':
    case 'NewExpression':
      return parent.callee === node
    case 'MemberExpression':
      return parent.object === node
    default:
      return false
  }
}

function findEnclosingStatement(node: ESTree.Node): ESTree.Node {
  let current = node
  while (
    current.parent &&
    !current.type.endsWith('Statement') &&
    (current.type as string) !== 'Program'
  ) {
    current = current.parent
  }
  return current
}

function getStatementSafeFix(context: Context, node: ESTree.Node, fix: string): string | null {
  const statement = findEnclosingStatement(node)
  if (statement.type !== 'ExpressionStatement' || statement.range[0] !== node.range[0]) {
    return fix
  }

  const safeFix = /^(?:function(?![\w$])|class(?![\w$])|\{)/u.test(fix) ? `(${fix})` : fix
  const hasAsiHazard = ['[', '(', '+', '-', '/', '`'].some((prefix) => safeFix.startsWith(prefix))
  if (!hasAsiHazard) return safeFix

  const previousToken = context.sourceCode.getTokenBefore(statement)
  return previousToken && !new Set([';', '{']).has(previousToken.value) ? null : safeFix
}

function sanitizeCode(code: string): string {
  const strings: string[] = []
  const withoutStrings = code.replaceAll(
    /(?<quote>["'`])(?:\\.|(?!\k<quote>)[^\\])*\k<quote>/gu,
    (match) => {
      strings.push(match)
      return `__STRING_${strings.length - 1}__`
    },
  )
  let normalized = withoutStrings
    .replaceAll(/\/\/.*$/gmu, '')
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/\s+/gu, ' ')
    .replaceAll(/\(\s+/gu, '(')
    .replaceAll(/\s+\)/gu, ')')
    .trim()

  strings.forEach((value, index) => {
    normalized = normalized.replace(`__STRING_${index}__`, value)
  })
  return normalized
}

function createDeMorganRule(kind: RuleKind): Rule {
  return {
    meta: {
      type: 'suggestion',
      docs: {
        description: kind.description,
        recommended: true,
        url: `https://github.com/azat-io/eslint-plugin-de-morgan/blob/main/docs/${kind.messageId === 'convertNegatedConjunction' ? 'no-negated-conjunction' : 'no-negated-disjunction'}.md`,
      },
      fixable: 'code',
      schema: [],
      messages: {
        [kind.messageId]: `Replace negated ${kind.sourceOperator === '&&' ? 'conjunction' : 'disjunction'} \`{{ original }}\` with \`{{ fixed }}\``,
      },
    },
    createOnce(context) {
      const visit = (node: ESTree.UnaryExpression): void => {
        if (
          node.operator !== '!' ||
          !isLogicalExpression(node.argument) ||
          (node.parent?.type === 'UnaryExpression' && node.parent.operator === '!') ||
          node.argument.operator !== kind.sourceOperator ||
          !isPureLogicalGroup(node.argument, context) ||
          (hasRelevantNestedNegation(node.argument) && !hasBooleanContext(node))
        ) {
          return
        }

        const transformed = transformLogical(
          node.argument,
          context,
          kind,
          isInTruthinessContext(node),
        )
        const fixed = needsParentParens(node, kind.targetOperator)
          ? `(${transformed})`
          : transformed
        const safeFix = getStatementSafeFix(context, node, fixed)
        const report = {
          node,
          messageId: kind.messageId,
          data: {
            original: sanitizeCode(context.sourceCode.getText(node)),
            fixed: sanitizeCode(safeFix ?? fixed),
          },
        } as const

        if (safeFix === null) {
          context.report(report)
        } else {
          const fix: FixFn = (fixer) => fixer.replaceText(node, safeFix)
          context.report({ ...report, fix })
        }
      }

      return {
        UnaryExpression: visit,
      }
    },
  }
}

export const noNegatedConjunctionRule = createDeMorganRule({
  sourceOperator: '&&',
  targetOperator: '||',
  messageId: 'convertNegatedConjunction',
  description:
    'Transforms the negation of a conjunction !(A && B) into the equivalent disjunction !A || !B according to De Morgan’s law',
})

export const noNegatedDisjunctionRule = createDeMorganRule({
  sourceOperator: '||',
  targetOperator: '&&',
  messageId: 'convertNegatedDisjunction',
  description:
    'Transforms the negation of a disjunction !(A || B) into the equivalent conjunction !A && !B according to De Morgan’s law',
})
