/**
 * File overview here, scroll to bottom.
 * @link https://github.com/solidjs/eslint-plugin-solid/blob/main/docs/reactivity.md
 */

import type { Context, ESTree as T, Reference, Rule, Variable } from '@oxlint/plugins'
import {
  findParent,
  findInScope,
  isPropsByName,
  isFunctionNode,
  isProgramOrFunctionNode,
  getSolidSourceRegex,
  trackImports,
  isDOMElementName,
  ignoreTransparentWrappers,
  getFunctionName,
  isJSXElementOrFragment,
  isSolidV2,
  trace,
  createNameMatcher,
  getFunctionHeadLocation,
  findVariableInScope,
  findVariable,
  getScope,
  getSourceCode,
  traverseNode,
  type CompatContext,
  type FunctionNode,
  type ProgramOrFunctionNode,
} from './utils.ts'

interface ReactiveVariable {
  references: Array<Reference>
  declarationScope: ProgramOrFunctionNode
  variable: Variable
}

interface TrackedScope {
  node: T.Node
  expect: 'function' | 'called-function' | 'expression'
}

class ScopeStackItem {
  node: ProgramOrFunctionNode
  trackedScopes: Array<TrackedScope> = []
  unnamedDerivedSignals = new Set<FunctionNode>()
  hasJSX = false

  constructor(node: ProgramOrFunctionNode) {
    this.node = node
  }
}

class ScopeStack extends Array<ScopeStackItem> {
  currentScope = () => this[this.length - 1]
  parentScope = () => this[this.length - 2]
  syncCallbacks = new Set<FunctionNode>()

  pushSignal(
    variable: Variable,
    declarationScope: ProgramOrFunctionNode = this.currentScope().node,
  ) {
    this.signals.push({
      references: variable.references.filter((reference) => !reference.init),
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

  pushProps(
    variable: Variable,
    declarationScope: ProgramOrFunctionNode = this.currentScope().node,
  ) {
    this.props.push({
      references: variable.references.filter((reference) => !reference.init),
      variable,
      declarationScope,
    })
  }

  *consumeSignalReferencesInScope() {
    yield* this.consumeReferencesInScope(this.signals)
    this.signals = this.signals.filter((variable) => variable.references.length !== 0)
  }

  *consumePropsReferencesInScope() {
    yield* this.consumeReferencesInScope(this.props)
    this.props = this.props.filter((variable) => variable.references.length !== 0)
  }

  private *consumeReferencesInScope(
    variables: Array<ReactiveVariable>,
  ): Iterable<{ reference: Reference; declarationScope: ProgramOrFunctionNode }> {
    for (const variable of variables) {
      const { references } = variable
      const inScope: Array<Reference> = [],
        notInScope: Array<Reference> = []
      references.forEach((reference) => {
        if (this.isReferenceInCurrentScope(reference)) {
          inScope.push(reference)
        } else {
          notInScope.push(reference)
        }
      })
      yield* inScope.map((reference) => ({
        reference,
        declarationScope: variable.declarationScope,
      }))
      variable.references = notInScope
    }
  }

  private findDeepestDeclarationScope = (
    a: ProgramOrFunctionNode,
    b: ProgramOrFunctionNode,
  ): ProgramOrFunctionNode => {
    if (a === b) return a
    for (let i = this.length - 1; i >= 0; i -= 1) {
      const { node } = this[i]
      if (a === node || b === node) {
        return node
      }
    }
    throw new Error('This should never happen')
  }

  private isReferenceInCurrentScope(reference: Reference) {
    let parentFunction = findParent(reference.identifier, isProgramOrFunctionNode)
    while (isFunctionNode(parentFunction) && this.syncCallbacks.has(parentFunction)) {
      parentFunction = findParent(parentFunction, isProgramOrFunctionNode)
    }
    return parentFunction === this.currentScope().node
  }

  private signals: Array<ReactiveVariable> = []
  private props: Array<ReactiveVariable> = []
}

const getNthDestructuredVar = (id: T.Node, n: number, context: CompatContext): Variable | null => {
  if (id?.type === 'ArrayPattern') {
    const el = id.elements[n]
    if (el?.type === 'Identifier') {
      return findVariable(context, el)
    }
  } else if (id?.type === 'ObjectPattern') {
    const el = id.properties.find((p): p is T.BindingProperty => {
      if (p.type !== 'Property') return false
      if (p.key.type !== 'Literal') return false

      const key = p.key
      return key.value === n || (typeof key.value === 'string' && key.value === String(n))
    })

    if (el?.type === 'Property' && el.value.type === 'Identifier') {
      return findVariable(context, el.value)
    }
  }
  return null
}

const getReturnedVar = (id: T.Node, context: CompatContext): Variable | null => {
  if (id.type === 'Identifier') {
    return findVariable(context, id)
  }
  return null
}

export const reactivityRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that reactivity (props, signals, memos, etc.) is properly used, so changes in those values will be tracked and update the view as expected.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/reactivity.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          customReactiveFunctions: {
            description:
              "List of function names to consider as reactive functions (allow signals to be safely passed as arguments). Supports exact names, '*' wildcards ('use*Store'), and regexes given as '/pattern/' strings. In addition, any create* or use* functions are automatically included.",
            type: 'array',
            items: {
              type: 'string',
            },
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
      readAfterAwait:
        "The reactive variable '{{name}}' is read after this computation suspends (at an 'await' or 'yield'), so changes to it won't be tracked. Read it before the first 'await' and store the result in a variable.",
      staleCapture:
        "'{{captured}}' captures the value of the reactive variable '{{name}}' at setup, but a returned function reads the capture later — it will never update. Call '{{name}}' inside the returned function instead, or prefix '{{captured}}' with 'initial'/'default'/'static' if a one-time snapshot is intended.",
      providerValue:
        "A context provider reads its 'value' prop only once, when it is created, so the reactive variable '{{name}}' will not stay up to date here. Pass the signal, memo, or store itself (or an object containing them) instead of reading it in JSX.",
    },
  },
  createOnce(context) {
    const warnShouldDestructure = (node: T.Node, nth?: string) =>
      context.report({
        node,
        messageId: 'shouldDestructure',
        data: nth ? { nth: nth + ' ' } : undefined,
      })
    const warnShouldAssign = (node: T.Node) => context.report({ node, messageId: 'shouldAssign' })

    let sourceCode: Context['sourceCode']
    let scopeStack = new ScopeStack()
    const currentScope = () => scopeStack.currentScope()
    const parentScope = () => scopeStack.parentScope()
    let tracked = trackImports()
    const matchImport = (imports: string | string[], str: string) =>
      tracked.matchImport(imports, str)
    const handleImportDeclaration = (node: T.ImportDeclaration) =>
      tracked.handleImportDeclaration(node)
    let v2 = false
    let matchesCustomReactive: (name: string) => boolean = () => false
    let providerValueContainers = new WeakSet<T.Node>()
    let asyncTrackedScopes = new Set<FunctionNode>()
    let suspensionTaintCache = new Map<FunctionNode, number | null>()

    const isCreatedContext = (name: string, refNode: T.Node): boolean => {
      const variable = findVariableInScope(getScope(context, refNode), name)
      const def = variable?.defs[0]
      return Boolean(
        def &&
        def.node.type === 'VariableDeclarator' &&
        def.node.init?.type === 'CallExpression' &&
        def.node.init.callee.type === 'Identifier' &&
        matchImport('createContext', def.node.init.callee.name),
      )
    }

    const isProviderElementName = (name: T.JSXOpeningElement['name']): boolean => {
      if (name.type === 'JSXIdentifier') {
        return name.name.endsWith('Provider') || isCreatedContext(name.name, name)
      }
      if (name.type === 'JSXMemberExpression') {
        return name.property.name === 'Provider'
      }
      return false
    }

    const getSuspensionTaint = (fn: ProgramOrFunctionNode): number | null => {
      if (!isFunctionNode(fn) || !asyncTrackedScopes.has(fn)) return null
      const cached = suspensionTaintCache.get(fn)
      if (cached !== undefined) return cached
      let suspension: T.Node | undefined
      traverseNode(fn.body as T.Node, {
        enter(cn) {
          const node = cn as T.Node
          if (node !== fn.body && isFunctionNode(node)) {
            return 'skip'
          } else if (node.type === 'AwaitExpression' || node.type === 'YieldExpression') {
            suspension = node
            return 'break'
          }
        },
        fallback: 'iteration',
      })
      let taint: number | null = null
      if (suspension) {
        taint = suspension.range[1]
        let ancestor: T.Node | null | undefined = suspension.parent
        while (ancestor && ancestor !== fn) {
          if (
            ancestor.type === 'ForStatement' ||
            ancestor.type === 'WhileStatement' ||
            ancestor.type === 'DoWhileStatement'
          ) {
            taint = ancestor.range[0]
          } else if (ancestor.type === 'ForOfStatement' || ancestor.type === 'ForInStatement') {
            taint = ancestor.body.range[0]
          }
          ancestor = ancestor.parent
        }
      }
      suspensionTaintCache.set(fn, taint)
      return taint
    }

    const markPropsOnCondition = (
      node: FunctionNode,
      cb: (props: T.Node & { name: string }) => boolean,
    ) => {
      if (
        node.params.length === 1 &&
        node.params[0].type === 'Identifier' &&
        node.parent?.type !== 'JSXExpressionContainer' &&
        node.parent?.type !== 'TemplateLiteral' &&
        cb(node.params[0])
      ) {
        const propsParam = findVariable(context, node.params[0])
        if (propsParam) {
          scopeStack.pushProps(propsParam, node)
        }
      }
    }

    const onFunctionEnter = (node: ProgramOrFunctionNode) => {
      if (isFunctionNode(node)) {
        if (scopeStack.syncCallbacks.has(node)) {
          return
        }
        markPropsOnCondition(node, (props) => isPropsByName(props.name))
      }
      scopeStack.push(new ScopeStackItem(node))
    }

    const matchTrackedScope = (trackedScope: TrackedScope, node: T.Node): boolean => {
      switch (trackedScope.expect) {
        case 'function':
        case 'called-function':
          return node === trackedScope.node
        case 'expression':
          return Boolean(
            findInScope(node, currentScope().node, (node) => node === trackedScope.node),
          )
      }
    }

    const isDirectlyReturned = (fn: FunctionNode): boolean =>
      fn.parent?.type === 'ReturnStatement' ||
      (fn.parent?.type === 'ArrowFunctionExpression' && fn.parent.body === fn)

    const getEffectivePropertyParent = (fn: FunctionNode): T.Node | null => {
      let child: T.Node = fn
      let parent: T.Node | null = fn.parent ?? null
      while (
        parent &&
        ((parent.type === 'ConditionalExpression' && child !== parent.test) ||
          (parent.type === 'LogicalExpression' && child === parent.right))
      ) {
        child = parent
        parent = parent.parent ?? null
      }
      return parent
    }

    const checkStaleCapture = (identifier: T.Node & { name: string }): boolean => {
      const call = identifier.parent
      if (call?.type !== 'CallExpression' || call.callee !== identifier) return false
      let child: T.Node = call
      while (
        child.parent &&
        child.parent.type !== 'VariableDeclarator' &&
        !isFunctionNode(child.parent) &&
        !child.parent.type.endsWith('Statement')
      ) {
        child = child.parent
      }
      const declarator = child.parent
      if (declarator?.type !== 'VariableDeclarator' || declarator.init !== child) return false

      const currentScopeNode = currentScope().node
      const capturedVars = sourceCode.scopeManager?.getDeclaredVariables(declarator) ?? []
      for (const captured of capturedVars) {
        if (/^(?:initial|default|static[A-Z])/.test(captured.name)) continue
        for (const reference of captured.references) {
          if (reference.init) continue
          if (isCapturedInReturnedFunction(reference.identifier, currentScopeNode)) {
            context.report({
              node: call,
              messageId: 'staleCapture',
              data: { name: identifier.name, captured: captured.name },
            })
            return true
          }
        }
      }
      return false
    }

    const isCapturedInReturnedFunction = (
      node: T.Node,
      boundary: ProgramOrFunctionNode,
    ): boolean => {
      let outermost: FunctionNode | null = null
      let cursor: T.Node | null = node
      while (cursor && cursor !== boundary) {
        if (isFunctionNode(cursor)) outermost = cursor
        cursor = cursor.parent ?? null
      }
      if (!cursor || !outermost) return false
      let child: T.Node = outermost
      let parent: T.Node | null = child.parent ?? null
      while (parent && child !== boundary) {
        if (parent.type === 'ReturnStatement') return true
        if (parent.type === 'CallExpression' || parent.type === 'NewExpression') return false
        if (isFunctionNode(parent)) {
          if (
            parent === boundary &&
            child.type === 'BlockStatement' &&
            isDeclaredClosureReturned(outermost, boundary)
          ) {
            return true
          }
          return (
            parent === boundary &&
            parent.type === 'ArrowFunctionExpression' &&
            parent.body === child &&
            child.type !== 'BlockStatement'
          )
        }
        child = parent
        parent = parent.parent ?? null
      }
      return false
    }

    const isDeclaredClosureReturned = (
      closure: FunctionNode,
      boundary: ProgramOrFunctionNode,
    ): boolean => {
      const declaration =
        closure.type === 'FunctionDeclaration'
          ? closure
          : closure.parent?.type === 'VariableDeclarator' && closure.parent.init === closure
            ? closure.parent
            : null
      if (!declaration) return false
      const variables = sourceCode.scopeManager?.getDeclaredVariables(declaration) ?? []
      return variables.some((variable) =>
        variable.references.some(
          (reference) => !reference.init && isReferenceReturned(reference.identifier, boundary),
        ),
      )
    }

    const isReferenceReturned = (node: T.Node, boundary: ProgramOrFunctionNode): boolean => {
      let cursor: T.Node | null = node.parent ?? null
      while (cursor && cursor !== boundary) {
        if (cursor.type === 'ReturnStatement') return true
        if (
          cursor.type === 'CallExpression' ||
          cursor.type === 'NewExpression' ||
          isFunctionNode(cursor)
        ) {
          return false
        }
        cursor = cursor.parent ?? null
      }
      return false
    }

    const handleTrackedScopes = (
      identifier: T.Node & { name: string },
      declarationScope: ProgramOrFunctionNode,
    ) => {
      const currentScopeNode = currentScope().node
      if (
        !currentScope().trackedScopes.find((trackedScope) =>
          matchTrackedScope(trackedScope, identifier),
        )
      ) {
        const matchedExpression = currentScope().trackedScopes.find((trackedScope) =>
          matchTrackedScope({ ...trackedScope, expect: 'expression' }, identifier),
        )
        if (declarationScope === currentScopeNode) {
          let parentMemberExpression: T.MemberExpression | null = null
          if (identifier.parent?.type === 'MemberExpression') {
            parentMemberExpression = identifier.parent
            while (parentMemberExpression!.parent?.type === 'MemberExpression') {
              parentMemberExpression = parentMemberExpression!.parent
            }
          }
          const parentCallExpression =
            identifier.parent?.type === 'CallExpression' ? identifier.parent : null
          const inProviderValue = Boolean(
            findParent(identifier, (n) => providerValueContainers.has(n)),
          )
          context.report({
            node: parentMemberExpression ?? parentCallExpression ?? identifier,
            messageId: inProviderValue
              ? 'providerValue'
              : matchedExpression
                ? 'expectedFunctionGotExpression'
                : 'untrackedReactive',
            data: {
              name: parentMemberExpression
                ? sourceCode.getText(parentMemberExpression)
                : identifier.name,
            },
          })
        } else {
          if (!parentScope() || !isFunctionNode(currentScopeNode)) {
            throw new Error("this shouldn't happen!")
          }

          checkStaleCapture(identifier)

          const pushUnnamedDerivedSignal = () =>
            (parentScope().unnamedDerivedSignals ??= new Set()).add(currentScopeNode)

          if (isDirectlyReturned(currentScopeNode)) {
            // Directly returned accessor handed to caller
          } else if (currentScopeNode.type === 'FunctionDeclaration') {
            const functionVariable: Variable | undefined =
              sourceCode.scopeManager?.getDeclaredVariables(currentScopeNode)?.[0]
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
          } else if (getEffectivePropertyParent(currentScopeNode)?.type === 'Property') {
            // ignore object property callbacks
          } else {
            pushUnnamedDerivedSignal()
          }
        }
      }
    }

    const onFunctionExit = (currentScopeNode: ProgramOrFunctionNode) => {
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

      const suspensionTaint = getSuspensionTaint(currentScopeNode)
      const isReadAfterSuspension = (identifier: T.Node): boolean =>
        suspensionTaint != null && identifier.range[0] >= suspensionTaint

      for (const { reference, declarationScope } of scopeStack.consumeSignalReferencesInScope()) {
        const identifier = reference.identifier
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: 'noWrite',
            data: { name: identifier.name },
          })
        } else if (identifier.type === 'Identifier') {
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
            if (isReadAfterSuspension(identifier)) {
              context.report({
                node: identifier,
                messageId: 'readAfterAwait',
                data: { name: identifier.name },
              })
            } else {
              handleTrackedScopes(identifier, declarationScope)
            }
          } else if (identifier.parent?.type === 'TemplateLiteral') {
            reportBadSignal('template literals')
          } else if (
            identifier.parent?.type === 'BinaryExpression' &&
            [
              '<',
              '<=',
              '>',
              '>=',
              '<<',
              '>>',
              '>>>',
              '+',
              '-',
              '*',
              '/',
              '%',
              '**',
              '|',
              '^',
              '&',
              'in',
            ].includes(identifier.parent.operator)
          ) {
            reportBadSignal('arithmetic or comparisons')
          } else if (
            identifier.parent?.type === 'UnaryExpression' &&
            ['-', '+', '~'].includes(identifier.parent.operator)
          ) {
            reportBadSignal('unary expressions')
          } else if (
            identifier.parent?.type === 'MemberExpression' &&
            identifier.parent.computed &&
            identifier.parent.property === identifier
          ) {
            reportBadSignal('property accesses')
          } else if (
            identifier.parent?.type === 'JSXExpressionContainer' &&
            !currentScope().trackedScopes.find(
              (trackedScope) =>
                trackedScope.node === identifier &&
                (trackedScope.expect === 'function' || trackedScope.expect === 'called-function'),
            )
          ) {
            const elementOrAttribute = identifier.parent.parent
            if (
              isJSXElementOrFragment(elementOrAttribute) ||
              (!v2 &&
                elementOrAttribute?.type === 'JSXAttribute' &&
                elementOrAttribute.parent?.type === 'JSXOpeningElement' &&
                elementOrAttribute.parent.name.type === 'JSXIdentifier' &&
                isDOMElementName(elementOrAttribute.parent.name.name))
            ) {
              reportBadSignal('JSX')
            }
          }
        }
      }

      for (const { reference, declarationScope } of scopeStack.consumePropsReferencesInScope()) {
        const identifier = reference.identifier
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: 'noWrite',
            data: { name: identifier.name },
          })
        } else if (
          identifier.parent?.type === 'MemberExpression' &&
          identifier.parent.object === identifier
        ) {
          const { parent } = identifier
          if (parent.parent?.type === 'AssignmentExpression' && parent.parent.left === parent) {
            context.report({
              node: identifier,
              messageId: 'noWrite',
              data: { name: identifier.name },
            })
          } else if (
            parent.property.type === 'Identifier' &&
            /^(?:initial|default|static[A-Z])/.test(parent.property.name)
          ) {
            // intentional snapshot
          } else if (isReadAfterSuspension(identifier)) {
            context.report({
              node: identifier,
              messageId: 'readAfterAwait',
              data: { name: identifier.name },
            })
          } else {
            handleTrackedScopes(identifier, declarationScope)
          }
        } else if (
          identifier.type === 'Identifier' &&
          (identifier.parent?.type === 'AssignmentExpression' ||
            identifier.parent?.type === 'VariableDeclarator')
        ) {
          if (
            identifier.parent.type === 'AssignmentExpression' &&
            identifier.parent.right === identifier &&
            identifier.parent.left.type === 'MemberExpression'
          ) {
            // storing proxy reference
          } else {
            handleTrackedScopes(identifier, declarationScope)
          }
        }
      }

      const { unnamedDerivedSignals } = currentScope()
      if (unnamedDerivedSignals) {
        for (const node of unnamedDerivedSignals) {
          if (
            !currentScope().trackedScopes.find((trackedScope) =>
              matchTrackedScope(trackedScope, node),
            )
          ) {
            context.report({
              loc: getFunctionHeadLocation(node, sourceCode),
              messageId: 'badUnnamedDerivedSignal',
            })
          }
        }
      }

      scopeStack.pop()
    }

    const checkForSyncCallbacks = (node: T.CallExpression) => {
      if (
        node.arguments.length === 1 &&
        isFunctionNode(node.arguments[0]) &&
        !node.arguments[0].async
      ) {
        if (
          node.callee.type === 'Identifier' &&
          matchImport(['batch', 'produce', 'flush'], node.callee.name)
        ) {
          scopeStack.syncCallbacks.add(node.arguments[0])
        } else if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.object.type !== 'ObjectExpression' &&
          /^(?:forEach|map|flatMap|reduce|reduceRight|find|findIndex|filter|every|some)$/.test(
            node.callee.property.name,
          )
        ) {
          scopeStack.syncCallbacks.add(node.arguments[0])
        }
      }
      if (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Array' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'from' &&
        isFunctionNode(node.arguments[1]) &&
        !node.arguments[1].async
      ) {
        scopeStack.syncCallbacks.add(node.arguments[1])
      }
      if (node.callee.type === 'Identifier') {
        if (
          matchImport(
            ['createSignal', 'createStore', 'createOptimistic', 'createOptimisticStore'],
            node.callee.name,
          ) &&
          node.parent?.type === 'VariableDeclarator'
        ) {
          const setter = getNthDestructuredVar(node.parent.id, 1, context)
          if (setter) {
            for (const reference of setter.references) {
              const { identifier } = reference
              if (
                !reference.init &&
                reference.isRead() &&
                identifier.parent?.type === 'CallExpression'
              ) {
                for (const arg of identifier.parent.arguments) {
                  if (isFunctionNode(arg) && !arg.async) {
                    scopeStack.syncCallbacks.add(arg)
                  }
                }
              }
            }
          }
        } else if (matchImport(['mapArray', 'indexArray', 'repeat'], node.callee.name)) {
          const arg1 = node.arguments[1]
          if (isFunctionNode(arg1)) {
            scopeStack.syncCallbacks.add(arg1)
          }
        }
      }
      if (isFunctionNode(node.callee)) {
        scopeStack.syncCallbacks.add(node.callee)
      }
    }

    const checkForReactiveAssignment = (
      id: T.BindingPattern | T.AssignmentExpression['left'] | null,
      init: T.Node,
    ) => {
      init = ignoreTransparentWrappers(init)

      if (init.type === 'CallExpression' && init.callee.type === 'Identifier') {
        const { callee } = init
        if (matchImport(['createSignal', 'useTransition', 'createOptimistic'], callee.name)) {
          const signal = id && getNthDestructuredVar(id, 0, context)
          if (signal) {
            scopeStack.pushSignal(signal, currentScope().node)
          } else {
            warnShouldDestructure(id ?? init, 'first')
          }
        } else if (matchImport(['createMemo', 'createSelector'], callee.name)) {
          const memo = id && getReturnedVar(id, context)
          if (memo) {
            scopeStack.pushSignal(memo, currentScope().node)
          } else {
            warnShouldAssign(id ?? init)
          }
        } else if (matchImport(['createStore', 'createOptimisticStore'], callee.name)) {
          const store = id && getNthDestructuredVar(id, 0, context)
          if (store) {
            scopeStack.pushProps(store, currentScope().node)
          } else {
            warnShouldDestructure(id ?? init, 'first')
          }
        } else if (matchImport(['mergeProps', 'merge', 'omit'], callee.name)) {
          const merged = id && getReturnedVar(id, context)
          if (merged) {
            scopeStack.pushProps(merged, currentScope().node)
          } else {
            warnShouldAssign(id ?? init)
          }
        } else if (matchImport('splitProps', callee.name)) {
          if (id?.type === 'ArrayPattern') {
            const vars = id.elements
              .map((_: unknown, i: number) => getNthDestructuredVar(id, i, context))
              .filter(Boolean) as Array<Variable>
            if (vars.length === 0) {
              warnShouldDestructure(id)
            } else {
              vars.forEach((variable) => {
                scopeStack.pushProps(variable, currentScope().node)
              })
            }
          } else {
            const vars = id && getReturnedVar(id, context)
            if (vars) {
              scopeStack.pushProps(vars, currentScope().node)
            }
          }
        } else if (matchImport('createResource', callee.name)) {
          const resourceReturn = id && getNthDestructuredVar(id, 0, context)
          if (resourceReturn) {
            scopeStack.pushProps(resourceReturn, currentScope().node)
          }
        } else if (matchImport(['createMutable', 'createProjection'], callee.name)) {
          const mutable = id && getReturnedVar(id, context)
          if (mutable) {
            scopeStack.pushProps(mutable, currentScope().node)
          }
        } else if (matchImport('mapArray', callee.name)) {
          const arg1 = init.arguments[1]
          if (
            isFunctionNode(arg1) &&
            arg1.params.length >= 2 &&
            arg1.params[1].type === 'Identifier'
          ) {
            const indexSignal = findVariable(context, arg1.params[1])
            if (indexSignal) {
              scopeStack.pushSignal(indexSignal)
            }
          }
        } else if (matchImport('indexArray', callee.name)) {
          const arg1 = init.arguments[1]
          if (
            isFunctionNode(arg1) &&
            arg1.params.length >= 1 &&
            arg1.params[0].type === 'Identifier'
          ) {
            const valueSignal = findVariable(context, arg1.params[0])
            if (valueSignal) {
              scopeStack.pushSignal(valueSignal)
            }
          }
        }
      }
    }

    const checkForTrackedScopes = (
      node:
        | T.JSXExpressionContainer
        | T.JSXSpreadAttribute
        | T.CallExpression
        | T.VariableDeclarator
        | T.AssignmentExpression
        | T.TaggedTemplateExpression
        | T.NewExpression,
    ) => {
      const pushTrackedScope = (
        node: T.Node,
        expect: TrackedScope['expect'],
        allowAsync = false,
      ) => {
        currentScope().trackedScopes.push({ node, expect })
        if (
          expect !== 'called-function' &&
          isFunctionNode(node) &&
          (node.async || node.generator)
        ) {
          if (allowAsync) {
            asyncTrackedScopes.add(node)
          } else if (node.async) {
            context.report({
              node,
              messageId: 'noAsyncTrackedScope',
            })
          }
        }
      }
      const permissivelyTrackNode = (node: T.Node) => {
        traverseNode(node, {
          enter(cn) {
            const childNode = cn as T.Node
            const traced = trace(childNode, context)
            if (
              isFunctionNode(traced) ||
              (traced.type === 'Identifier' &&
                traced.parent.type !== 'MemberExpression' &&
                !(traced.parent.type === 'CallExpression' && traced.parent.callee === traced)) ||
              (traced.type === 'CallExpression' &&
                traced.callee.type === 'Identifier' &&
                matchImport(
                  ['createMemo', 'createSelector', 'children', 'createProjection'],
                  traced.callee.name,
                ))
            ) {
              pushTrackedScope(childNode, 'called-function')
              return 'skip'
            }
          },
          fallback: 'iteration',
        })
      }

      if (node.type === 'JSXExpressionContainer') {
        if (
          node.parent?.type === 'JSXAttribute' &&
          sourceCode.getText(node.parent.name).startsWith('on') &&
          node.parent.parent?.type === 'JSXOpeningElement' &&
          node.parent.parent.name.type === 'JSXIdentifier' &&
          isDOMElementName(node.parent.parent.name.name)
        ) {
          pushTrackedScope(node.expression, 'called-function')
        } else if (
          node.parent?.type === 'JSXAttribute' &&
          node.parent.name.type === 'JSXNamespacedName' &&
          node.parent.name.namespace.name === 'use' &&
          isFunctionNode(node.expression)
        ) {
          pushTrackedScope(node.expression, 'called-function')
        } else if (
          node.parent?.type === 'JSXAttribute' &&
          node.parent.name.name === 'value' &&
          node.parent.parent?.type === 'JSXOpeningElement' &&
          isProviderElementName(node.parent.parent.name)
        ) {
          providerValueContainers.add(node)
        } else if (
          node.parent?.type === 'JSXAttribute' &&
          node.parent.name?.type === 'JSXIdentifier' &&
          /^static[A-Z]/.test(node.parent.name.name) &&
          node.parent.parent?.type === 'JSXOpeningElement' &&
          node.parent.parent.name.type === 'JSXIdentifier' &&
          !isDOMElementName(node.parent.parent.name.name)
        ) {
          // static* prop convention
        } else if (
          node.parent?.type === 'JSXAttribute' &&
          node.parent.name.name === 'ref' &&
          isFunctionNode(node.expression)
        ) {
          pushTrackedScope(node.expression, 'called-function')
        } else if (isJSXElementOrFragment(node.parent) && isFunctionNode(node.expression)) {
          pushTrackedScope(node.expression, 'function')
        } else {
          pushTrackedScope(node.expression, 'expression')
        }
      } else if (node.type === 'JSXSpreadAttribute') {
        pushTrackedScope(node.argument, 'expression')
      } else if (node.type === 'NewExpression') {
        const {
          callee,
          arguments: { 0: arg0 },
        } = node
        if (
          callee.type === 'Identifier' &&
          arg0 &&
          [
            'IntersectionObserver',
            'MutationObserver',
            'PerformanceObserver',
            'ReportingObserver',
            'ResizeObserver',
          ].includes(callee.name)
        ) {
          pushTrackedScope(arg0, 'called-function')
        }
      } else if (node.type === 'CallExpression') {
        if (node.callee.type === 'Identifier') {
          const {
            callee,
            arguments: { 0: arg0, 1: arg1 },
          } = node
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
                'mapArray',
                'indexArray',
                'observable',
                'createTrackedEffect',
                'isPending',
                'latest',
                'resolve',
                'deep',
                'repeat',
                'createErrorBoundary',
                'createLoadingBoundary',
                'createRevealOrder',
                'dynamic',
                'dynamicComponent',
                'until',
              ],
              callee.name,
            )
          ) {
            pushTrackedScope(
              arg0,
              'function',
              Boolean(
                matchImport(
                  ['createMemo', 'createDeferred', 'dynamic', 'dynamicComponent'],
                  callee.name,
                ),
              ),
            )
            if (
              matchImport(['createErrorBoundary', 'createLoadingBoundary'], callee.name) &&
              arg1
            ) {
              pushTrackedScope(arg1, 'called-function')
            }
            if (
              matchImport(['createEffect', 'createRenderEffect'], callee.name) &&
              isFunctionNode(arg1)
            ) {
              pushTrackedScope(arg1, 'called-function')
            }
          } else if (matchImport('untrack', callee.name) && arg0) {
            pushTrackedScope(arg0, 'called-function')
          } else if (matchImport('createResource', callee.name)) {
            const arg1IsFunction = arg1 && isFunctionNode(trace(arg1, context))
            if (arg1IsFunction) {
              pushTrackedScope(arg0, 'function')
              pushTrackedScope(arg1, 'called-function')
            } else if (arg0) {
              pushTrackedScope(arg0, 'called-function')
            }
          } else if (matchImport(['mergeProps', 'merge'], callee.name)) {
            for (const arg of node.arguments) {
              if (arg.type === 'SpreadElement') continue
              if (isFunctionNode(trace(arg, context))) {
                pushTrackedScope(arg, 'function')
              }
            }
          } else if (
            matchImport(
              [
                'createSignal',
                'createStore',
                'createProjection',
                'createOptimistic',
                'createOptimisticStore',
              ],
              callee.name,
            ) &&
            isFunctionNode(arg0)
          ) {
            pushTrackedScope(arg0, 'function', true)
          } else if (
            matchImport(
              ['onMount', 'onCleanup', 'onError', 'onSettled', 'onFlush', 'action'],
              callee.name,
            ) ||
            [
              'setInterval',
              'setTimeout',
              'setImmediate',
              'requestAnimationFrame',
              'requestIdleCallback',
            ].includes(callee.name)
          ) {
            pushTrackedScope(arg0, 'called-function')
          } else if (matchImport('on', callee.name)) {
            if (arg0) {
              if (arg0.type === 'ArrayExpression') {
                arg0.elements.forEach((element) => {
                  if (element && element?.type !== 'SpreadElement') {
                    pushTrackedScope(element, 'function')
                  }
                })
              } else {
                pushTrackedScope(arg0, 'function')
              }
            }
            if (arg1) {
              pushTrackedScope(arg1, 'called-function')
            }
          } else if (matchImport('createStore', callee.name) && arg0?.type === 'ObjectExpression') {
            for (const property of arg0.properties) {
              if (
                property.type === 'Property' &&
                property.kind === 'get' &&
                isFunctionNode(property.value)
              ) {
                pushTrackedScope(property.value, 'function')
              }
            }
          } else if (matchImport('runWithOwner', callee.name)) {
            if (arg1) {
              let isTrackedScope = true
              const owner = arg0.type === 'Identifier' && findVariable(context, arg0)
              if (owner) {
                const decl = owner.defs[0]
                if (
                  decl &&
                  decl.node.type === 'VariableDeclarator' &&
                  decl.node.init?.type === 'CallExpression' &&
                  decl.node.init.callee.type === 'Identifier' &&
                  matchImport('getOwner', decl.node.init.callee.name)
                ) {
                  const ownerFunction = findParent(decl.node, isProgramOrFunctionNode)
                  const scopeStackIndex = scopeStack.findIndex(({ node }) => ownerFunction === node)
                  if (
                    (scopeStackIndex >= 1 &&
                      !scopeStack[scopeStackIndex - 1].trackedScopes.some(
                        (trackedScope) =>
                          trackedScope.expect === 'function' && trackedScope.node === ownerFunction,
                      )) ||
                    scopeStackIndex === 0
                  ) {
                    isTrackedScope = false
                  }
                }
              }
              if (isTrackedScope) {
                pushTrackedScope(arg1, 'function')
              }
            }
          } else if (
            /^(?:use|create)[A-Z]/.test(callee.name) ||
            matchesCustomReactive(callee.name)
          ) {
            for (const arg of node.arguments) {
              permissivelyTrackNode(arg)
            }
          } else if (
            parentScope()?.trackedScopes.some(
              (trackedScope) =>
                (trackedScope.expect === 'function' || trackedScope.expect === 'called-function') &&
                trackedScope.node === currentScope().node,
            )
          ) {
            for (const arg of node.arguments) {
              if (isFunctionNode(arg)) {
                pushTrackedScope(arg, 'called-function')
              }
            }
          }
        } else if (node.callee.type === 'MemberExpression') {
          const { property } = node.callee
          if (
            property.type === 'Identifier' &&
            property.name === 'addEventListener' &&
            node.arguments.length >= 2
          ) {
            pushTrackedScope(node.arguments[1], 'called-function')
          } else if (
            property.type === 'Identifier' &&
            [
              'setInterval',
              'setTimeout',
              'setImmediate',
              'requestAnimationFrame',
              'requestIdleCallback',
            ].includes(property.name)
          ) {
            if (node.arguments[0]) {
              pushTrackedScope(node.arguments[0], 'called-function')
            }
          } else if (
            property.type === 'Identifier' &&
            ['then', 'catch', 'finally'].includes(property.name)
          ) {
            for (const arg of node.arguments) {
              if (arg.type !== 'SpreadElement') {
                pushTrackedScope(arg, 'called-function')
              }
            }
          } else if (
            property.type === 'Identifier' &&
            (/^(?:use|create)[A-Z]/.test(property.name) || matchesCustomReactive(property.name))
          ) {
            for (const arg of node.arguments) {
              permissivelyTrackNode(arg)
            }
          }
        }
      } else if (node.type === 'VariableDeclarator') {
        if (node.init?.type === 'CallExpression' && node.init.callee.type === 'Identifier') {
          if (matchImport(['createReactive', 'createReaction'], node.init.callee.name)) {
            const track = getReturnedVar(node.id, context)
            if (track) {
              for (const reference of track.references) {
                if (
                  !reference.init &&
                  reference.isReadOnly() &&
                  reference.identifier.parent?.type === 'CallExpression' &&
                  reference.identifier.parent.callee === reference.identifier
                ) {
                  const arg0 = reference.identifier.parent.arguments[0]
                  if (arg0) {
                    pushTrackedScope(arg0, 'function')
                  }
                }
              }
            }
            if (isFunctionNode(node.init.arguments[0])) {
              pushTrackedScope(node.init.arguments[0], 'called-function')
            }
          }
        }
      } else if (node.type === 'AssignmentExpression') {
        if (
          node.left.type === 'MemberExpression' &&
          node.left.property.type === 'Identifier' &&
          isFunctionNode(node.right) &&
          /^on[a-z]+$/.test(node.left.property.name)
        ) {
          pushTrackedScope(node.right, 'called-function')
        }
      } else if (node.type === 'TaggedTemplateExpression') {
        for (const expression of node.quasi.expressions) {
          if (isFunctionNode(expression)) {
            pushTrackedScope(expression, 'called-function')

            for (const param of expression.params) {
              if (param.type === 'Identifier' && isPropsByName(param.name)) {
                const variable = findVariable(context, param)
                if (variable) scopeStack.pushProps(variable, currentScope().node)
              }
            }
          }
        }
      }
    }

    return {
      before() {
        sourceCode = getSourceCode(context)
        scopeStack = new ScopeStack()
        tracked = trackImports(getSolidSourceRegex(context))
        v2 = isSolidV2(context)
        const options = (context.options as [{ customReactiveFunctions?: string[] }?])[0] ?? {}
        matchesCustomReactive = createNameMatcher(options.customReactiveFunctions ?? [])
        providerValueContainers = new WeakSet<T.Node>()
        asyncTrackedScopes = new Set<FunctionNode>()
        suspensionTaintCache = new Map<FunctionNode, number | null>()
      },
      ImportDeclaration: handleImportDeclaration,
      JSXExpressionContainer(node: T.JSXExpressionContainer) {
        checkForTrackedScopes(node)
      },
      JSXSpreadAttribute(node: T.JSXSpreadAttribute) {
        checkForTrackedScopes(node)
      },
      CallExpression(node: T.CallExpression) {
        checkForTrackedScopes(node)
        checkForSyncCallbacks(node)

        const parent = node.parent && ignoreTransparentWrappers(node.parent, true)
        if (
          parent?.type !== 'AssignmentExpression' &&
          parent?.type !== 'VariableDeclarator' &&
          parent?.type !== 'ReturnStatement' &&
          !(parent?.type === 'ArrowFunctionExpression' && parent.body === node)
        ) {
          if (parent?.type === 'CallExpression' && parent.arguments.includes(node)) {
            let outer: T.Node = parent
            let outerParent = outer.parent && ignoreTransparentWrappers(outer.parent, true)
            while (
              outerParent?.type === 'CallExpression' &&
              outerParent.arguments.includes(outer as T.Expression)
            ) {
              outer = outerParent
              outerParent = outer.parent && ignoreTransparentWrappers(outer.parent, true)
            }
            if (outerParent?.type === 'VariableDeclarator') {
              checkForReactiveAssignment(outerParent.id, node)
            } else if (
              outerParent?.type === 'AssignmentExpression' &&
              outerParent.left.type !== 'MemberExpression'
            ) {
              checkForReactiveAssignment(outerParent.left, node)
            }
          } else {
            checkForReactiveAssignment(null, node)
          }
        }
      },
      NewExpression(node: T.NewExpression) {
        checkForTrackedScopes(node)
      },
      VariableDeclarator(node: T.VariableDeclarator) {
        if (node.init) {
          checkForReactiveAssignment(node.id, node.init)
          checkForTrackedScopes(node)
        }
      },
      AssignmentExpression(node: T.AssignmentExpression) {
        if (node.left.type !== 'MemberExpression') {
          checkForReactiveAssignment(node.left, node.right)
        }
        checkForTrackedScopes(node)
      },
      TaggedTemplateExpression(node: T.TaggedTemplateExpression) {
        checkForTrackedScopes(node)
      },
      'JSXElement > JSXExpressionContainer > :function'(node: T.Node) {
        if (
          isFunctionNode(node) &&
          node.parent?.type === 'JSXExpressionContainer' &&
          node.parent.parent?.type === 'JSXElement'
        ) {
          const element = node.parent.parent

          if (element.openingElement.name.type === 'JSXIdentifier') {
            const tagName = element.openingElement.name.name
            if (matchImport('For', tagName)) {
              const keyedAttr = element.openingElement.attributes.find(
                (attr): attr is T.JSXAttribute =>
                  attr.type === 'JSXAttribute' &&
                  attr.name.type === 'JSXIdentifier' &&
                  attr.name.name === 'keyed',
              )
              let itemIsSignal = false
              let indexIsSignal = true
              if (keyedAttr && keyedAttr.value?.type === 'JSXExpressionContainer') {
                const keyedValue = keyedAttr.value.expression
                if (keyedValue.type === 'Literal' && keyedValue.value === false) {
                  itemIsSignal = true
                  indexIsSignal = false
                } else if (!(keyedValue.type === 'Literal' && keyedValue.value === true)) {
                  itemIsSignal = true
                }
              }
              if (itemIsSignal && node.params.length >= 1 && node.params[0].type === 'Identifier') {
                const item = findVariable(context, node.params[0])
                if (item) {
                  scopeStack.pushSignal(item, currentScope().node)
                }
              }
              if (
                indexIsSignal &&
                node.params.length === 2 &&
                node.params[1].type === 'Identifier'
              ) {
                const index = findVariable(context, node.params[1])
                if (index) {
                  scopeStack.pushSignal(index, currentScope().node)
                }
              }
            } else if (
              matchImport('Index', tagName) &&
              node.params.length >= 1 &&
              node.params[0].type === 'Identifier'
            ) {
              const item = findVariable(context, node.params[0])
              if (item) {
                scopeStack.pushSignal(item, currentScope().node)
              }
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
        if (scopeStack.length) {
          currentScope().hasJSX = true
        }
      },
      JSXFragment() {
        if (scopeStack.length) {
          currentScope().hasJSX = true
        }
      },
    }
  },
}
