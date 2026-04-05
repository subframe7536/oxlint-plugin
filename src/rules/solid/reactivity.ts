import type { Rule, ESTree, Variable, Context } from '@oxlint/plugins'
import {
  findParent,
  findInScope,
  isPropsByName,
  isFunctionNode,
  isProgramOrFunctionNode,
  trackImports,
  isDOMElementName,
  ignoreTransparentWrappers,
  getFunctionName,
  isJSXElementOrFragment,
  trace,
  findVariable,
  traverseNode,
  type FunctionNode,
  type ProgramOrFunctionNode,
  type Reference,
} from './utils.ts'

// Reference is re-exported from utils (from @oxlint/plugins scope types)

interface ReactiveVariable {
  references: Reference[]
  declarationScope: ProgramOrFunctionNode
  variable: Variable
}

interface TrackedScope {
  node: ESTree.Node
  expect: 'function' | 'called-function' | 'expression'
}

class ScopeStackItem {
  node: ProgramOrFunctionNode
  trackedScopes: TrackedScope[] = []
  unnamedDerivedSignals = new Set<FunctionNode>()
  hasJSX = false

  constructor(node: ProgramOrFunctionNode) {
    this.node = node
  }
}

class ScopeStack {
  private items: ScopeStackItem[] = []
  private signals: ReactiveVariable[] = []
  private props: ReactiveVariable[] = []

  readonly syncCallbacks: Set<FunctionNode> = new Set()

  get length() {
    return this.items.length
  }

  push(item: ScopeStackItem) {
    this.items.push(item)
  }

  pop(): ScopeStackItem | undefined {
    return this.items.pop()
  }

  findIndex(pred: (item: ScopeStackItem) => boolean): number {
    return this.items.findIndex(pred)
  }

  // Allow indexed access for scopes
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]()
  }

  at(i: number): ScopeStackItem | undefined {
    return this.items.at(i)
  }

  getAt(i: number): ScopeStackItem {
    return this.items[i]!
  }

  currentScope(): ScopeStackItem {
    return this.items[this.items.length - 1]!
  }

  parentScope(): ScopeStackItem | undefined {
    return this.items[this.items.length - 2]
  }

  pushSignal(variable: Variable, declarationScope: ProgramOrFunctionNode = this.currentScope().node) {
    this.signals.push({
      references: variable.references.filter((r) => !r.init),
      variable,
      declarationScope,
    })
  }

  pushUniqueSignal(variable: Variable, declarationScope: ProgramOrFunctionNode) {
    const foundSignal = this.signals.find((s) => s.variable === variable)
    if (!foundSignal) {
      this.pushSignal(variable, declarationScope)
    } else {
      foundSignal.declarationScope = this.findDeepestDeclarationScope(
        foundSignal.declarationScope,
        declarationScope,
      )
    }
  }

  pushProps(variable: Variable, declarationScope: ProgramOrFunctionNode = this.currentScope().node) {
    this.props.push({
      references: variable.references.filter((r) => !r.init),
      variable,
      declarationScope,
    })
  }

  consumeSignalReferencesInScope(): Array<{ reference: Reference; declarationScope: ProgramOrFunctionNode }> {
    const result = this.consumeReferencesInScope(this.signals)
    this.signals = this.signals.filter((v) => v.references.length !== 0)
    return result
  }

  consumePropsReferencesInScope(): Array<{ reference: Reference; declarationScope: ProgramOrFunctionNode }> {
    const result = this.consumeReferencesInScope(this.props)
    this.props = this.props.filter((v) => v.references.length !== 0)
    return result
  }

  private consumeReferencesInScope(
    variables: ReactiveVariable[],
  ): Array<{ reference: Reference; declarationScope: ProgramOrFunctionNode }> {
    const result: Array<{ reference: Reference; declarationScope: ProgramOrFunctionNode }> = []
    for (const variable of variables) {
      const inScope: Reference[] = []
      const notInScope: Reference[] = []
      for (const reference of variable.references) {
        if (this.isReferenceInCurrentScope(reference)) {
          inScope.push(reference)
        } else {
          notInScope.push(reference)
        }
      }
      result.push(...inScope.map((reference) => ({ reference, declarationScope: variable.declarationScope })))
      variable.references = notInScope
    }
    return result
  }

  private findDeepestDeclarationScope(
    a: ProgramOrFunctionNode,
    b: ProgramOrFunctionNode,
  ): ProgramOrFunctionNode {
    if (a === b) return a
    for (let i = this.items.length - 1; i >= 0; i--) {
      const { node } = this.items[i]!
      if (a === node || b === node) return node
    }
    throw new Error('This should never happen')
  }

  private isReferenceInCurrentScope(reference: Reference) {
    let parentFunction = findParent(reference.identifier, isProgramOrFunctionNode)
    while (isFunctionNode(parentFunction) && this.syncCallbacks.has(parentFunction)) {
      parentFunction = findParent(parentFunction!, isProgramOrFunctionNode)
    }
    return parentFunction === this.currentScope().node
  }
}

function getFunctionHeadLoc(node: FunctionNode) {
  // Return location of function head - from start to opening brace or arrow
  if (node.type === 'ArrowFunctionExpression') {
    const body = node.body
    return { start: node.loc!.start, end: body.loc!.start }
  }
  const body = node.body as ESTree.BlockStatement
  return { start: node.loc!.start, end: body.loc!.start }
}

const getNthDestructuredVar = (
  id: ESTree.Node,
  n: number,
  context: Context,
): Variable | null => {
  if (id.type === 'ArrayPattern') {
    const el = (id as ESTree.ArrayPattern).elements[n]
    if (el?.type === 'Identifier') {
      return findVariable(context, el as ESTree.IdentifierReference & { name: string })
    }
  }
  return null
}

const getReturnedVar = (
  id: ESTree.Node,
  context: Context,
): Variable | null => {
  if (id.type === 'Identifier') {
    return findVariable(context, id as ESTree.IdentifierReference & { name: string })
  }
  return null
}

export const reactivityRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that reactivity (props, signals, memos, etc.) is properly used, so changes in those values will be tracked and update the view as expected.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/reactivity.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          customReactiveFunctions: {
            description:
              'List of function names to consider as reactive functions (allow signals to be safely passed as arguments). In addition, any create* or use* functions are automatically included.',
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noWrite: "The reactive variable '{{name}}' should not be reassigned or altered directly.",
      untrackedReactive:
        "The reactive variable '{{name}}' should be used within JSX, a tracked scope (like createEffect), or inside an event handler function, or else changes will be ignored.",
      expectedFunctionGotExpression:
        "The reactive variable '{{name}}' should be wrapped in a function for reactivity. This includes event handler bindings on native elements, which are not reactive like other JSX props.",
      badSignal:
        "The reactive variable '{{name}}' should be called as a function when used in {{where}}.",
      badUnnamedDerivedSignal:
        'This function should be passed to a tracked scope (like createEffect) or an event handler because it contains reactivity, or else changes will be ignored.',
      shouldDestructure:
        'For proper analysis, array destructuring should be used to capture the {{nth}}result of this function call.',
      shouldAssign:
        'For proper analysis, a variable should be used to capture the result of this function call.',
      noAsyncTrackedScope:
        "This tracked scope should not be async. Solid's reactivity only tracks synchronously.",
    },
  },
  create(context) {
    const options = ((context.options as [{ customReactiveFunctions?: string[] }?])[0]) ?? {}
    const customReactiveFunctions = options.customReactiveFunctions ?? []

    const warnShouldDestructure = (node: ESTree.Node, nth?: string) =>
      context.report({
        node,
        messageId: 'shouldDestructure',
        data: nth ? { nth: nth + ' ' } : undefined,
      })
    const warnShouldAssign = (node: ESTree.Node) =>
      context.report({ node, messageId: 'shouldAssign' })

    const sourceCode = context.sourceCode
    const scopeStack = new ScopeStack()
    const currentScope = () => scopeStack.currentScope()
    const parentScope = () => scopeStack.parentScope()
    const { matchImport, handleImportDeclaration } = trackImports()

    const markPropsOnCondition = (node: FunctionNode, cb: (props: ESTree.IdentifierReference) => boolean) => {
      if (
        node.params.length === 1 &&
        (node.params[0].type === 'Identifier') &&
        node.parent?.type !== 'JSXExpressionContainer' &&
        node.parent?.type !== 'TemplateLiteral' &&
        cb(node.params[0] as ESTree.IdentifierReference)
      ) {
        const propsParam = findVariable(context, node.params[0] as ESTree.IdentifierReference & { name: string })
        if (propsParam) {
          scopeStack.pushProps(propsParam, node)
        }
      }
    }

    const onFunctionEnter = (node: ESTree.Node) => {
      const funcNode = node as ProgramOrFunctionNode
      if (isFunctionNode(funcNode)) {
        if (scopeStack.syncCallbacks.has(funcNode)) return
        markPropsOnCondition(funcNode, (props) => isPropsByName(props.name))
      }
      scopeStack.push(new ScopeStackItem(funcNode))
    }

    const matchTrackedScope = (trackedScope: TrackedScope, node: ESTree.Node): boolean => {
      switch (trackedScope.expect) {
        case 'function':
        case 'called-function':
          return node === trackedScope.node
        case 'expression':
          return Boolean(findInScope(node, currentScope().node, (n) => n === trackedScope.node))
      }
    }

    const handleTrackedScopes = (
      identifier: ESTree.IdentifierReference,
      declarationScope: ProgramOrFunctionNode,
    ) => {
      const currentScopeNode = currentScope().node
      if (!currentScope().trackedScopes.find((ts) => matchTrackedScope(ts, identifier))) {
        const matchedExpression = currentScope().trackedScopes.find((ts) =>
          matchTrackedScope({ ...ts, expect: 'expression' }, identifier),
        )
        if (declarationScope === currentScopeNode) {
          let parentMemberExpression: ESTree.MemberExpression | null = null
          if (identifier.parent?.type === 'MemberExpression') {
            parentMemberExpression = identifier.parent as ESTree.MemberExpression
            while (
              parentMemberExpression!.parent?.type === 'MemberExpression'
            ) {
              parentMemberExpression = parentMemberExpression!.parent as ESTree.MemberExpression
            }
          }
          const parentCallExpression =
            identifier.parent?.type === 'CallExpression' ? identifier.parent : null
          context.report({
            node: parentMemberExpression ?? parentCallExpression ?? identifier,
            messageId: matchedExpression ? 'expectedFunctionGotExpression' : 'untrackedReactive',
            data: {
              name: parentMemberExpression
                ? sourceCode.getText(parentMemberExpression)
                : identifier.name,
            },
          })
        } else {
          if (!parentScope() || !isFunctionNode(currentScopeNode)) {
            return
          }

          const pushUnnamedDerivedSignal = () => {
            // Add to the PARENT scope's unnamedDerivedSignals so the parent can check if it's tracked
            parentScope()!.unnamedDerivedSignals.add(currentScopeNode)
          }

          if (currentScopeNode.type === 'FunctionDeclaration') {
            const functionVariable = sourceCode.scopeManager?.getDeclaredVariables(currentScopeNode)?.[0]
            if (functionVariable) {
              scopeStack.pushUniqueSignal(functionVariable, declarationScope)
            } else {
              pushUnnamedDerivedSignal()
            }
          } else if (currentScopeNode.parent?.type === 'VariableDeclarator') {
            const declarator = currentScopeNode.parent
            const functionVariable = sourceCode.scopeManager?.getDeclaredVariables(declarator)?.[0]
            if (functionVariable) {
              scopeStack.pushUniqueSignal(functionVariable, declarationScope)
            } else {
              pushUnnamedDerivedSignal()
            }
          } else {
            pushUnnamedDerivedSignal()
          }
        }
      }
    }

    const onFunctionExit = (node: ESTree.Node) => {
      const currentScopeNode = node as ProgramOrFunctionNode

      if (isFunctionNode(currentScopeNode)) {
        markPropsOnCondition(currentScopeNode, (props) => {
          if (!isPropsByName(props.name) && currentScope().hasJSX) {
            const functionName = getFunctionName(currentScopeNode)
            if (functionName && !/^[a-z]/.test(functionName)) return true
          }
          return false
        })
      }

      if (isFunctionNode(currentScopeNode) && scopeStack.syncCallbacks.has(currentScopeNode)) {
        return
      }

      for (const { reference, declarationScope } of scopeStack.consumeSignalReferencesInScope()) {
        const identifier = reference.identifier as ESTree.IdentifierReference
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: 'noWrite',
            data: { name: identifier.name },
          })
        } else if (identifier.type === 'Identifier' || identifier.type === 'IdentifierReference') {
          const reportBadSignal = (where: string) =>
            context.report({
              node: identifier,
              messageId: 'badSignal',
              data: { name: identifier.name, where },
            })
          if (
            identifier.parent?.type === 'CallExpression' ||
            (identifier.parent?.type === 'ArrayExpression' &&
              identifier.parent.parent?.type === 'CallExpression')
          ) {
            handleTrackedScopes(identifier, declarationScope)
          } else if (identifier.parent?.type === 'TemplateLiteral') {
            reportBadSignal('template literals')
          } else if (
            identifier.parent?.type === 'BinaryExpression' &&
            [
              '<', '<=', '>', '>=', '<<', '>>', '>>>', '+', '-', '*', '/', '%', '**',
              '|', '^', '&', 'in',
            ].includes((identifier.parent as ESTree.BinaryExpression).operator)
          ) {
            reportBadSignal('arithmetic or comparisons')
          } else if (
            identifier.parent?.type === 'UnaryExpression' &&
            ['-', '+', '~'].includes((identifier.parent as ESTree.UnaryExpression).operator)
          ) {
            reportBadSignal('unary expressions')
          } else if (
            (identifier.parent?.type === 'MemberExpression') &&
            !(identifier.parent as ESTree.MemberExpression).computed &&
            (identifier.parent as ESTree.StaticMemberExpression).property === identifier
          ) {
            reportBadSignal('property accesses')
          } else if (
            identifier.parent?.type === 'JSXExpressionContainer' &&
            !currentScope().trackedScopes.find(
              (ts) =>
                ts.node === identifier &&
                (ts.expect === 'function' || ts.expect === 'called-function'),
            )
          ) {
            const elementOrAttribute = identifier.parent.parent
            if (
              isJSXElementOrFragment(elementOrAttribute) ||
              (elementOrAttribute?.type === 'JSXAttribute' &&
                elementOrAttribute.parent?.type === 'JSXOpeningElement' &&
                (elementOrAttribute.parent as ESTree.JSXOpeningElement).name.type === 'JSXIdentifier' &&
                isDOMElementName(
                  ((elementOrAttribute.parent as ESTree.JSXOpeningElement).name as ESTree.JSXIdentifier).name,
                ))
            ) {
              reportBadSignal('JSX')
            }
          }
        }
      }

      for (const { reference, declarationScope } of scopeStack.consumePropsReferencesInScope()) {
        const identifier = reference.identifier as ESTree.IdentifierReference
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: 'noWrite',
            data: { name: identifier.name },
          })
        } else if (
          (identifier.parent?.type === 'MemberExpression') &&
          (identifier.parent as ESTree.MemberExpression).object === identifier
        ) {
          const parent = identifier.parent as ESTree.MemberExpression
          if (
            parent.parent?.type === 'AssignmentExpression' &&
            (parent.parent as ESTree.AssignmentExpression).left === parent
          ) {
            context.report({
              node: identifier,
              messageId: 'noWrite',
              data: { name: identifier.name },
            })
          } else if (
            parent.property.type === 'Identifier' &&
            /^(?:initial|default|static[A-Z])/.test((parent.property as ESTree.IdentifierName).name)
          ) {
            // props.initialX or props.defaultX - intentionally not reactive
          } else {
            handleTrackedScopes(identifier, declarationScope)
          }
        } else if (
          identifier.parent?.type === 'AssignmentExpression' ||
          identifier.parent?.type === 'VariableDeclarator'
        ) {
          context.report({
            node: identifier,
            messageId: 'untrackedReactive',
            data: { name: identifier.name },
          })
        }
      }

      const { unnamedDerivedSignals } = currentScope()
      if (unnamedDerivedSignals) {
        for (const signalNode of unnamedDerivedSignals) {
          if (!currentScope().trackedScopes.find((ts) => matchTrackedScope(ts, signalNode))) {
            context.report({
              loc: getFunctionHeadLoc(signalNode),
              messageId: 'badUnnamedDerivedSignal',
            })
          }
        }
      }

      scopeStack.pop()
    }

    const checkForSyncCallbacks = (node: ESTree.CallExpression) => {
      if (
        node.arguments.length === 1 &&
        isFunctionNode(node.arguments[0]) &&
        !(node.arguments[0] as FunctionNode).async
      ) {
        if (
          node.callee.type === 'Identifier' &&
          matchImport(['batch', 'produce'], (node.callee as ESTree.IdentifierReference).name)
        ) {
          scopeStack.syncCallbacks.add(node.arguments[0] as FunctionNode)
        } else if (
          node.callee.type === 'MemberExpression' &&
          !(node.callee as ESTree.MemberExpression).computed &&
          (node.callee as ESTree.MemberExpression).object.type !== 'ObjectExpression' &&
          /^(?:forEach|map|flatMap|reduce|reduceRight|find|findIndex|filter|every|some)$/.test(
            ((node.callee as ESTree.StaticMemberExpression).property as ESTree.IdentifierName).name ?? '',
          )
        ) {
          scopeStack.syncCallbacks.add(node.arguments[0] as FunctionNode)
        }
      }
      if (node.callee.type === 'Identifier') {
        const calleeName = (node.callee as ESTree.IdentifierReference).name
        if (
          matchImport(['createSignal', 'createStore'], calleeName) &&
          node.parent?.type === 'VariableDeclarator'
        ) {
          const setter = getNthDestructuredVar((node.parent as ESTree.VariableDeclarator).id, 1, context)
          if (setter) {
            for (const reference of setter.references) {
              const { identifier } = reference
              if (
                !reference.init &&
                reference.isRead() &&
                identifier.parent?.type === 'CallExpression'
              ) {
                for (const arg of (identifier.parent as ESTree.CallExpression).arguments) {
                  if (isFunctionNode(arg) && !(arg as FunctionNode).async) {
                    scopeStack.syncCallbacks.add(arg as FunctionNode)
                  }
                }
              }
            }
          }
        } else if (matchImport(['mapArray', 'indexArray'], calleeName)) {
          const arg1 = node.arguments[1]
          if (isFunctionNode(arg1)) {
            scopeStack.syncCallbacks.add(arg1 as FunctionNode)
          }
        }
      }
      if (isFunctionNode(node.callee)) {
        scopeStack.syncCallbacks.add(node.callee as FunctionNode)
      }
    }

    const checkForReactiveAssignment = (
      id: ESTree.Node | null,
      init: ESTree.Node,
    ) => {
      let initNode = ignoreTransparentWrappers(init)

      if (initNode.type === 'CallExpression' && initNode.callee.type === 'Identifier') {
        const callee = initNode.callee as ESTree.IdentifierReference
        if (matchImport(['createSignal', 'useTransition'], callee.name)) {
          const signal = id && getNthDestructuredVar(id, 0, context)
          if (signal) {
            scopeStack.pushSignal(signal, currentScope().node)
          } else {
            warnShouldDestructure(id ?? initNode, 'first')
          }
        } else if (matchImport(['createMemo', 'createSelector'], callee.name)) {
          const memo = id && getReturnedVar(id, context)
          if (memo) {
            scopeStack.pushSignal(memo, currentScope().node)
          } else {
            warnShouldAssign(id ?? initNode)
          }
        } else if (matchImport('createStore', callee.name)) {
          const store = id && getNthDestructuredVar(id, 0, context)
          if (store) {
            scopeStack.pushProps(store, currentScope().node)
          } else {
            warnShouldDestructure(id ?? initNode, 'first')
          }
        } else if (matchImport('mergeProps', callee.name)) {
          const merged = id && getReturnedVar(id, context)
          if (merged) {
            scopeStack.pushProps(merged, currentScope().node)
          } else {
            warnShouldAssign(id ?? initNode)
          }
        } else if (matchImport('splitProps', callee.name)) {
          if (id?.type === 'ArrayPattern') {
            const vars = (id as ESTree.ArrayPattern).elements
              .map((_, i) => getNthDestructuredVar(id, i, context))
              .filter(Boolean) as Variable[]
            if (vars.length === 0) {
              warnShouldDestructure(id)
            } else {
              for (const variable of vars) {
                scopeStack.pushProps(variable, currentScope().node)
              }
            }
          } else {
            const vars = id && getReturnedVar(id, context)
            if (vars) scopeStack.pushProps(vars, currentScope().node)
          }
        } else if (matchImport('createResource', callee.name)) {
          const resourceReturn = id && getNthDestructuredVar(id, 0, context)
          if (resourceReturn) {
            scopeStack.pushProps(resourceReturn, currentScope().node)
          }
        } else if (matchImport('createMutable', callee.name)) {
          const mutable = id && getReturnedVar(id, context)
          if (mutable) scopeStack.pushProps(mutable, currentScope().node)
        } else if (matchImport('mapArray', callee.name)) {
          const arg1 = (initNode as ESTree.CallExpression).arguments[1]
          if (
            isFunctionNode(arg1) &&
            (arg1 as FunctionNode).params.length >= 2 &&
            (arg1 as FunctionNode).params[1].type === 'Identifier'
          ) {
            const indexSignal = findVariable(context, (arg1 as FunctionNode).params[1] as ESTree.IdentifierReference & { name: string })
            if (indexSignal) scopeStack.pushSignal(indexSignal)
          }
        } else if (matchImport('indexArray', callee.name)) {
          const arg1 = (initNode as ESTree.CallExpression).arguments[1]
          if (
            isFunctionNode(arg1) &&
            (arg1 as FunctionNode).params.length >= 1 &&
            (arg1 as FunctionNode).params[0].type === 'Identifier'
          ) {
            const valueSignal = findVariable(context, (arg1 as FunctionNode).params[0] as ESTree.IdentifierReference & { name: string })
            if (valueSignal) scopeStack.pushSignal(valueSignal)
          }
        }
      }
    }

    // Simplified permissive track node - traverse and mark functions as called-function tracked scopes
    const permissivelyTrackNode = (node: ESTree.Node) => {
      const pushTrackedScope = (n: ESTree.Node, expect: TrackedScope['expect']) => {
        currentScope().trackedScopes.push({ node: n, expect })
        if (expect !== 'called-function' && isFunctionNode(n) && (n as FunctionNode).async) {
          context.report({ node: n, messageId: 'noAsyncTrackedScope' })
        }
      }
      traverseNode(node, {
        enter(cn) {
          const traced = trace(cn, context)
          if (
            isFunctionNode(traced) ||
            (traced.type === 'Identifier' &&
              traced.parent?.type !== 'MemberExpression' &&
              !(traced.parent?.type === 'CallExpression' && (traced.parent as ESTree.CallExpression).callee === traced))
          ) {
            pushTrackedScope(cn, 'called-function')
            return 'skip'
          }
        },
        fallback: 'iteration',
      })
    }

    const checkForTrackedScopes = (
      node:
        | ESTree.JSXExpressionContainer
        | ESTree.JSXSpreadAttribute
        | ESTree.CallExpression
        | ESTree.VariableDeclarator
        | ESTree.AssignmentExpression
        | ESTree.TaggedTemplateExpression
        | ESTree.NewExpression,
    ) => {
      const pushTrackedScope = (node: ESTree.Node, expect: TrackedScope['expect']) => {
        currentScope().trackedScopes.push({ node, expect })
        if (expect !== 'called-function' && isFunctionNode(node) && (node as FunctionNode).async) {
          context.report({ node, messageId: 'noAsyncTrackedScope' })
        }
      }

      if (node.type === 'JSXExpressionContainer') {
        const jsxNode = node as ESTree.JSXExpressionContainer
        if (
          jsxNode.parent?.type === 'JSXAttribute' &&
          context.sourceCode.getText((jsxNode.parent as ESTree.JSXAttribute).name).startsWith('on') &&
          (jsxNode.parent as ESTree.JSXAttribute).parent?.type === 'JSXOpeningElement' &&
          ((jsxNode.parent as ESTree.JSXAttribute).parent as ESTree.JSXOpeningElement).name.type === 'JSXIdentifier' &&
          isDOMElementName(
            (((jsxNode.parent as ESTree.JSXAttribute).parent as ESTree.JSXOpeningElement).name as ESTree.JSXIdentifier).name,
          )
        ) {
          pushTrackedScope(jsxNode.expression, 'called-function')
        } else if (
          jsxNode.parent?.type === 'JSXAttribute' &&
          (jsxNode.parent as ESTree.JSXAttribute).name.type === 'JSXNamespacedName' &&
          ((jsxNode.parent as ESTree.JSXAttribute).name as ESTree.JSXNamespacedName).namespace.name === 'use' &&
          isFunctionNode(jsxNode.expression)
        ) {
          pushTrackedScope(jsxNode.expression, 'called-function')
        } else if (
          jsxNode.parent?.type === 'JSXAttribute' &&
          (jsxNode.parent as ESTree.JSXAttribute).name.type === 'JSXIdentifier' &&
          ((jsxNode.parent as ESTree.JSXAttribute).name as ESTree.JSXIdentifier).name === 'ref' &&
          isFunctionNode(jsxNode.expression)
        ) {
          pushTrackedScope(jsxNode.expression, 'called-function')
        } else if (isJSXElementOrFragment(jsxNode.parent) && isFunctionNode(jsxNode.expression)) {
          pushTrackedScope(jsxNode.expression, 'function')
        } else {
          pushTrackedScope(jsxNode.expression, 'expression')
        }
      } else if (node.type === 'JSXSpreadAttribute') {
        pushTrackedScope((node as ESTree.JSXSpreadAttribute).argument, 'expression')
      } else if (node.type === 'NewExpression') {
        const newNode = node as ESTree.NewExpression
        if (
          newNode.callee.type === 'Identifier' &&
          newNode.arguments[0] &&
          [
            'IntersectionObserver',
            'MutationObserver',
            'PerformanceObserver',
            'ReportingObserver',
            'ResizeObserver',
          ].includes((newNode.callee as ESTree.IdentifierReference).name)
        ) {
          pushTrackedScope(newNode.arguments[0], 'called-function')
        }
      } else if (node.type === 'CallExpression') {
        const callNode = node as ESTree.CallExpression
        if (callNode.callee.type === 'Identifier') {
          const callee = callNode.callee as ESTree.IdentifierReference
          const { name } = callee
          const arg0 = callNode.arguments[0]
          const arg1 = callNode.arguments[1]
          if (
            matchImport(
              [
                'createMemo',
                'children',
                'createEffect',
                'createRenderEffect',
                'createDeferred',
                'createComputed',
                'createSelector',
                'untrack',
                'mapArray',
                'indexArray',
                'observable',
              ],
              name,
            ) ||
            (matchImport('createResource', name) && callNode.arguments.length >= 2)
          ) {
            if (arg0) pushTrackedScope(arg0, 'function')
          } else if (
            matchImport(['onMount', 'onCleanup', 'onError'], name) ||
            ['setInterval', 'setTimeout', 'setImmediate', 'requestAnimationFrame', 'requestIdleCallback'].includes(name)
          ) {
            if (arg0) pushTrackedScope(arg0, 'called-function')
          } else if (matchImport('on', name)) {
            if (arg0) {
              if (arg0.type === 'ArrayExpression') {
                for (const el of (arg0 as ESTree.ArrayExpression).elements) {
                  if (el && el.type !== 'SpreadElement') pushTrackedScope(el, 'function')
                }
              } else {
                pushTrackedScope(arg0, 'function')
              }
            }
            if (arg1) pushTrackedScope(arg1, 'called-function')
          } else if (matchImport('createStore', name) && arg0?.type === 'ObjectExpression') {
            for (const property of (arg0 as ESTree.ObjectExpression).properties) {
              if (
                property.type === 'Property' &&
                (property as ESTree.ObjectProperty).kind === 'get' &&
                isFunctionNode((property as ESTree.ObjectProperty).value as ESTree.Node)
              ) {
                pushTrackedScope((property as ESTree.ObjectProperty).value as ESTree.Node, 'function')
              }
            }
          } else if (matchImport('runWithOwner', name)) {
            if (arg1) {
              let isTrackedScope = true
              const owner = arg0?.type === 'Identifier' && findVariable(context, arg0 as ESTree.IdentifierReference & { name: string })
              if (owner) {
                const decl = owner.defs[0]
                if (
                  decl &&
                  decl.node.type === 'VariableDeclarator' &&
                  (decl.node as ESTree.VariableDeclarator).init?.type === 'CallExpression' &&
                  ((decl.node as ESTree.VariableDeclarator).init as ESTree.CallExpression).callee.type === 'Identifier' &&
                  matchImport('getOwner', (((decl.node as ESTree.VariableDeclarator).init as ESTree.CallExpression).callee as ESTree.IdentifierReference).name)
                ) {
                  const ownerFunction = findParent(decl.node, isProgramOrFunctionNode)
                  const scopeStackIndex = scopeStack.findIndex(({ node: n }) => ownerFunction === n)
                  if (
                    (scopeStackIndex >= 1 &&
                      !scopeStack.getAt(scopeStackIndex - 1).trackedScopes.some(
                        (ts) => ts.expect === 'function' && ts.node === ownerFunction,
                      )) ||
                    scopeStackIndex === 0
                  ) {
                    isTrackedScope = false
                  }
                }
              }
              if (isTrackedScope) pushTrackedScope(arg1, 'function')
            }
          } else if (
            /^(?:use|create)[A-Z]/.test(name) ||
            customReactiveFunctions.includes(name)
          ) {
            for (const arg of callNode.arguments) {
              permissivelyTrackNode(arg)
            }
          }
        } else if (
          callNode.callee.type === 'MemberExpression' &&
          !(callNode.callee as ESTree.MemberExpression).computed
        ) {
          const property = (callNode.callee as ESTree.StaticMemberExpression).property
          if (
            property.type === 'Identifier' &&
            (property as ESTree.IdentifierName).name === 'addEventListener' &&
            callNode.arguments.length >= 2
          ) {
            pushTrackedScope(callNode.arguments[1], 'called-function')
          } else if (
            property.type === 'Identifier' &&
            (/^(?:use|create)[A-Z]/.test((property as ESTree.IdentifierName).name) ||
              customReactiveFunctions.includes((property as ESTree.IdentifierName).name))
          ) {
            for (const arg of callNode.arguments) {
              permissivelyTrackNode(arg)
            }
          }
        }
      } else if (node.type === 'VariableDeclarator') {
        const vd = node as ESTree.VariableDeclarator
        if (
          vd.init?.type === 'CallExpression' &&
          (vd.init as ESTree.CallExpression).callee.type === 'Identifier'
        ) {
          const callee = (vd.init as ESTree.CallExpression).callee as ESTree.IdentifierReference
          if (matchImport(['createReactive', 'createReaction'], callee.name)) {
            const track = getReturnedVar(vd.id, context)
            if (track) {
              for (const reference of track.references) {
                if (
                  !reference.init &&
                  reference.isReadOnly() &&
                  reference.identifier.parent?.type === 'CallExpression' &&
                  (reference.identifier.parent as ESTree.CallExpression).callee === reference.identifier
                ) {
                  const arg0 = (reference.identifier.parent as ESTree.CallExpression).arguments[0]
                  if (arg0) pushTrackedScope(arg0, 'function')
                }
              }
            }
            if (isFunctionNode((vd.init as ESTree.CallExpression).arguments[0])) {
              pushTrackedScope((vd.init as ESTree.CallExpression).arguments[0], 'called-function')
            }
          }
        }
      } else if (node.type === 'AssignmentExpression') {
        const ae = node as ESTree.AssignmentExpression
        if (
          ae.left.type === 'MemberExpression' &&
          !(ae.left as ESTree.MemberExpression).computed &&
          (ae.left as ESTree.MemberExpression).property.type === 'Identifier' &&
          isFunctionNode(ae.right) &&
          /^on[a-z]+$/.test(((ae.left as ESTree.StaticMemberExpression).property as ESTree.IdentifierName).name)
        ) {
          pushTrackedScope(ae.right, 'called-function')
        }
      } else if (node.type === 'TaggedTemplateExpression') {
        const tte = node as ESTree.TaggedTemplateExpression
        for (const expression of tte.quasi.expressions) {
          if (isFunctionNode(expression)) {
            pushTrackedScope(expression, 'called-function')
            for (const param of (expression as FunctionNode).params) {
              if (param.type === 'Identifier' && isPropsByName((param as ESTree.IdentifierReference).name)) {
                const variable = findVariable(context, param as ESTree.IdentifierReference & { name: string })
                if (variable) scopeStack.pushProps(variable, currentScope().node)
              }
            }
          }
        }
      }
    }

    return {
      ImportDeclaration: handleImportDeclaration,
      JSXExpressionContainer(node: ESTree.Node) {
        checkForTrackedScopes(node as ESTree.JSXExpressionContainer)
      },
      JSXSpreadAttribute(node: ESTree.Node) {
        checkForTrackedScopes(node as ESTree.JSXSpreadAttribute)
      },
      CallExpression(node: ESTree.Node) {
        checkForTrackedScopes(node as ESTree.CallExpression)
        checkForSyncCallbacks(node as ESTree.CallExpression)
        const parent = node.parent && ignoreTransparentWrappers(node.parent, true)
        if (parent?.type !== 'AssignmentExpression' && parent?.type !== 'VariableDeclarator') {
          checkForReactiveAssignment(null, node)
        }
      },
      NewExpression(node: ESTree.Node) {
        checkForTrackedScopes(node as ESTree.NewExpression)
      },
      VariableDeclarator(node: ESTree.Node) {
        const vd = node as ESTree.VariableDeclarator
        if (vd.init) {
          checkForReactiveAssignment(vd.id, vd.init)
          checkForTrackedScopes(vd)
        }
      },
      AssignmentExpression(node: ESTree.Node) {
        const ae = node as ESTree.AssignmentExpression
        if (ae.left.type !== 'MemberExpression') {
          checkForReactiveAssignment(ae.left, ae.right)
        }
        checkForTrackedScopes(ae)
      },
      TaggedTemplateExpression(node: ESTree.Node) {
        checkForTrackedScopes(node as ESTree.TaggedTemplateExpression)
      },
      'JSXElement > JSXExpressionContainer > :function'(node: ESTree.Node) {
        if (
          isFunctionNode(node) &&
          node.parent?.type === 'JSXExpressionContainer' &&
          node.parent.parent?.type === 'JSXElement'
        ) {
          const element = node.parent.parent as ESTree.JSXElement
          if (element.openingElement.name.type === 'JSXIdentifier') {
            const tagName = (element.openingElement.name as ESTree.JSXIdentifier).name
            const funcNode = node as FunctionNode
            if (
              matchImport('For', tagName) &&
              funcNode.params.length === 2 &&
              funcNode.params[1].type === 'Identifier'
            ) {
              const index = findVariable(context, funcNode.params[1] as ESTree.IdentifierReference & { name: string })
              if (index) scopeStack.pushSignal(index, currentScope().node)
            } else if (
              matchImport('Index', tagName) &&
              funcNode.params.length >= 1 &&
              funcNode.params[0].type === 'Identifier'
            ) {
              const item = findVariable(context, funcNode.params[0] as ESTree.IdentifierReference & { name: string })
              if (item) scopeStack.pushSignal(item, currentScope().node)
            }
          }
        }
      },
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      FunctionDeclaration: onFunctionEnter,
      Program: onFunctionEnter,
      'FunctionExpression:exit': onFunctionExit,
      'ArrowFunctionExpression:exit': onFunctionExit,
      'FunctionDeclaration:exit': onFunctionExit,
      'Program:exit': onFunctionExit,
      JSXElement() {
        if (scopeStack.length) currentScope().hasJSX = true
      },
      JSXFragment() {
        if (scopeStack.length) currentScope().hasJSX = true
      },
    }
  },
}
