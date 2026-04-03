import type { Context, ESTree, FixFn, Visitor, Rule } from '@oxlint/plugins'

/**
 * Get the text representation of a node's key.
 */
function getMethodKey(
  node: ESTree.TSMethodSignature | ESTree.TSPropertySignature,
  context: Context,
): string {
  let key = context.sourceCode.getText(node.key)
  if (node.computed) {
    key = `[${key}]`
  }
  if (node.optional) {
    key = `${key}?`
  }
  if (node.readonly) {
    key = `readonly ${key}`
  }
  return key
}

/**
 * Get the text representation of method parameters.
 */
function getMethodParams(
  node: ESTree.TSFunctionType | ESTree.TSMethodSignature,
  context: Context,
): string {
  const sourceCode = context.sourceCode

  if (node.params.length === 0) {
    // Handle empty params - need to include type parameters if present
    if (node.typeParameters) {
      const typeParams = sourceCode.getText(node.typeParameters)
      return `${typeParams}()`
    }
    return '()'
  }

  // Get the text range from opening paren to closing paren
  let paramsText = ''

  if (node.type === 'TSMethodSignature') {
    // Method signature: foo<T>(x: T): void
    const startIdx = node.range[0]
    const endIdx = node.range[1]
    const fullText = sourceCode.text.substring(startIdx, endIdx)

    // Find opening paren
    let openParenIdx = fullText.indexOf('(')
    if (openParenIdx === -1) {
      return '()'
    }

    // Find matching closing paren
    let depth = 1
    let closeParenIdx = openParenIdx + 1
    while (closeParenIdx < fullText.length && depth > 0) {
      if (fullText[closeParenIdx] === '(') {
        depth++
      }
      if (fullText[closeParenIdx] === ')') {
        depth--
      }
      closeParenIdx++
    }

    // Include type parameters (e.g. <T>) if present before the opening paren
    const typeParamsText = node.typeParameters ? sourceCode.getText(node.typeParameters) : ''
    paramsText = `${typeParamsText}${fullText.substring(openParenIdx, closeParenIdx)}`
  } else {
    // TSFunctionType: (x: T) => void
    const startIdx = node.range[0]
    const endIdx = node.range[1]
    const fullText = sourceCode.text.substring(startIdx, endIdx)

    // Find the arrow
    const arrowIdx = fullText.indexOf('=>')
    if (arrowIdx === -1) {
      return '()'
    }

    // Get everything before the arrow (should be the params including type params)
    paramsText = fullText.substring(0, arrowIdx).trim()
  }

  return paramsText
}

/**
 * Get the text representation of a return type.
 */
function getMethodReturnType(
  node: ESTree.TSFunctionType | ESTree.TSMethodSignature,
  context: Context,
): string {
  if (node.returnType === null) {
    // If the method has no return type, it implicitly has an `any` return type
    return 'any'
  }
  return context.sourceCode.getText(node.returnType.typeAnnotation)
}

/**
 * Get the delimiter (semicolon or comma) at the end of a node.
 */
function getDelimiter(node: ESTree.Node, context: Context): string {
  const lastToken = context.sourceCode.getLastToken(node)
  if (lastToken && (lastToken.value === ';' || lastToken.value === ',')) {
    return lastToken.value
  }
  return ''
}

/**
 * Check if a node is inside a module declaration.
 */
function isNodeParentModuleDeclaration(node: ESTree.Node): boolean {
  let current = node.parent
  while (current) {
    if (current.type === 'TSModuleDeclaration') {
      return true
    }
    if (current.type === 'Program') {
      return false
    }
    current = current.parent
  }
  return false
}

/**
 * Check if a return type references 'this' type.
 * Uses a WeakSet to track visited nodes and prevent infinite recursion.
 */
function returnTypeReferencesThisType(returnType: ESTree.TSTypeAnnotation | null): boolean {
  if (!returnType) {
    return false
  }

  // Use WeakSet to track visited nodes and prevent infinite recursion
  const visited = new WeakSet<ESTree.Node>()
  return checkForThisType(returnType.typeAnnotation, visited)
}

/**
 * Recursively check for TSThisType in a node.
 * Tracks visited nodes to prevent infinite recursion from circular references.
 */
function checkForThisType(node: ESTree.Node | null, visited: WeakSet<ESTree.Node>): boolean {
  if (!node) {
    return false
  }

  // Skip if already visited (prevents infinite recursion)
  if (visited.has(node)) {
    return false
  }
  visited.add(node)

  // Check if this is a TSThisType
  if (node.type === 'TSThisType') {
    return true
  }

  // Properties to skip (these create circular references or aren't relevant)
  const skipKeys = new Set(['parent', 'loc', 'range', 'start', 'end'])

  // Check children
  for (const key of Object.keys(node)) {
    // Skip properties that cause circular references
    if (skipKeys.has(key)) {
      continue
    }

    const value = (node as unknown as Record<string, unknown>)[key]
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'type' in item) {
            if (checkForThisType(item as ESTree.Node, visited)) {
              return true
            }
          }
        }
      } else if ('type' in value) {
        if (checkForThisType(value as ESTree.Node, visited)) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * Get all members from a parent (interface body or type literal).
 */
function getMembers(
  parent: ESTree.Node,
): (ESTree.TSMethodSignature | ESTree.TSPropertySignature)[] {
  if (parent.type === 'TSInterfaceBody') {
    return parent.body.filter(
      (m): m is ESTree.TSMethodSignature | ESTree.TSPropertySignature =>
        m.type === 'TSMethodSignature' || m.type === 'TSPropertySignature',
    )
  }
  if (parent.type === 'TSTypeLiteral') {
    return parent.members.filter(
      (m): m is ESTree.TSMethodSignature | ESTree.TSPropertySignature =>
        m.type === 'TSMethodSignature' || m.type === 'TSPropertySignature',
    )
  }
  return []
}

/**
 * Create the visitor for the 'property' mode.
 * This mode enforces using function property syntax instead of method shorthand.
 */
function createPropertyModeVisitor(context: Context): Visitor {
  return {
    TSMethodSignature(methodNode: ESTree.TSMethodSignature): void {
      // Only process 'method' kind signatures
      if (methodNode.kind !== 'method') {
        return
      }

      const skipFix = returnTypeReferencesThisType(methodNode.returnType)
      const parent = methodNode.parent
      const members = getMembers(parent)

      // Find duplicate method signatures with the same key (for method overloads)
      const duplicatedKeyMethodNodes = members.filter(
        (element): element is ESTree.TSMethodSignature =>
          element.type === 'TSMethodSignature' &&
          element !== methodNode &&
          getMethodKey(element, context) === getMethodKey(methodNode, context),
      )

      const isParentModule = isNodeParentModuleDeclaration(methodNode)

      // Handle method overloads
      if (duplicatedKeyMethodNodes.length > 0) {
        if (isParentModule) {
          context.report({
            node: methodNode,
            messageId: 'errorMethod',
          })
        } else {
          const fix: FixFn | undefined = skipFix
            ? undefined
            : (fixer) => {
                const methodNodes = [methodNode, ...duplicatedKeyMethodNodes].sort((a, b) =>
                  a.range[0] < b.range[0] ? -1 : 1,
                )

                const typeString = methodNodes
                  .map((node) => {
                    const params = getMethodParams(node, context)
                    const returnType = getMethodReturnType(node, context)
                    return `(${params} => ${returnType})`
                  })
                  .join(' & ')

                const key = getMethodKey(methodNode, context)
                const delimiter = getDelimiter(methodNode, context)

                // Replace the entire overload range with a single property signature
                const firstNode = methodNodes[0]
                const lastNode = methodNodes[methodNodes.length - 1]
                const text = context.sourceCode.text
                const first = firstNode.range[0]
                const lastEnd = lastNode.range[1]

                // Determine newline length immediately after the last node (if any)
                let newlineLen = 0
                if (lastEnd < text.length && (text[lastEnd] === '\r' || text[lastEnd] === '\n')) {
                  newlineLen =
                    text[lastEnd] === '\r' &&
                    lastEnd + 1 < text.length &&
                    text[lastEnd + 1] === '\n'
                      ? 2
                      : 1
                }

                // Compute range of any spaces/tabs that follow (either immediately or after the newline)
                let spacesStart = lastEnd + newlineLen
                let spacesEnd = spacesStart
                while (
                  spacesEnd < text.length &&
                  (text[spacesEnd] === ' ' || text[spacesEnd] === '\t')
                ) {
                  spacesEnd++
                }

                const fixes: ReturnType<FixFn> = []
                // Replace the method(s) up to the end of the last node (do not remove the newline)
                fixes.push(
                  fixer.replaceTextRange([first, lastEnd], `${key}: ${typeString}${delimiter}`),
                )
                // If there are spaces after the newline, remove them
                if (spacesEnd > spacesStart) {
                  // Remove surrounding indentation spaces
                  fixes.push(fixer.removeRange([spacesStart, spacesEnd]))
                }
                // Also remove trailing spaces at EOF (common in template literals)
                let trailingStart = text.length
                while (
                  trailingStart > 0 &&
                  (text[trailingStart - 1] === ' ' || text[trailingStart - 1] === '\t')
                ) {
                  trailingStart--
                }
                if (trailingStart < text.length) {
                  fixes.push(fixer.removeRange([trailingStart, text.length]))
                }
                return fixes
              }

          context.report({
            node: methodNode,
            messageId: 'errorMethod',
            fix,
          })
        }
        return
      }

      // Single method signature
      if (isParentModule) {
        context.report({
          node: methodNode,
          messageId: 'errorMethod',
        })
      } else {
        const fix: FixFn | undefined = skipFix
          ? undefined
          : (fixer) => {
              const key = getMethodKey(methodNode, context)
              const params = getMethodParams(methodNode, context)
              const returnType = getMethodReturnType(methodNode, context)
              const delimiter = getDelimiter(methodNode, context)
              const start = methodNode.range[0]
              const lastEnd = methodNode.range[1]
              const text = context.sourceCode.text

              let newlineLen = 0
              if (lastEnd < text.length && (text[lastEnd] === '\r' || text[lastEnd] === '\n')) {
                newlineLen =
                  text[lastEnd] === '\r' && lastEnd + 1 < text.length && text[lastEnd + 1] === '\n'
                    ? 2
                    : 1
              }

              let spacesStart = lastEnd + newlineLen
              let spacesEnd = spacesStart
              while (
                spacesEnd < text.length &&
                (text[spacesEnd] === ' ' || text[spacesEnd] === '\t')
              ) {
                spacesEnd++
              }

              const fixes: ReturnType<FixFn> = []
              // Proceed to compute fixes (remove surrounding indentation spaces if present)
              // Replace the method signature itself (preserve following newline)
              fixes.push(
                fixer.replaceTextRange(
                  [start, lastEnd],
                  `${key}: ${params} => ${returnType}${delimiter}`,
                ),
              )
              // Remove spaces after the newline if present
              if (spacesEnd > spacesStart) {
                fixes.push(fixer.removeRange([spacesStart, spacesEnd]))
              }
              // Also remove trailing spaces at EOF (common in template literals)
              let trailingStart = text.length
              while (
                trailingStart > 0 &&
                (text[trailingStart - 1] === ' ' || text[trailingStart - 1] === '\t')
              ) {
                trailingStart--
              }
              if (trailingStart < text.length) {
                fixes.push(fixer.removeRange([trailingStart, text.length]))
              }
              return fixes
            }

        context.report({
          node: methodNode,
          messageId: 'errorMethod',
          fix,
        })
      }
    },
  }
}

/**
 * Create the visitor for the 'method' mode.
 * This mode enforces using method shorthand syntax instead of function property.
 */
function createMethodModeVisitor(context: Context): Visitor {
  return {
    TSPropertySignature(propertyNode: ESTree.TSPropertySignature): void {
      const typeNode = propertyNode.typeAnnotation?.typeAnnotation
      if (typeNode?.type !== 'TSFunctionType') {
        return
      }

      context.report({
        node: propertyNode,
        messageId: 'errorProperty',
        fix: (fixer) => {
          const key = getMethodKey(propertyNode, context)
          const params = getMethodParams(typeNode, context)
          const returnType = getMethodReturnType(typeNode, context)
          const delimiter = getDelimiter(propertyNode, context)
          return fixer.replaceText(propertyNode, `${key}${params}: ${returnType}${delimiter}`)
        },
      })
    },
  }
}

/**
 * The method-signature-style rule.
 */
export const methodSignatureStyleRule: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce using a particular method signature syntax',
      recommended: false,
    },
    fixable: 'code',
    messages: {
      errorMethod: 'Shorthand method signature is forbidden. Use a function property instead.',
      errorProperty: 'Function property signature is forbidden. Use a method shorthand instead.',
    },
    schema: [
      {
        type: 'string',
        description: 'The method signature style to enforce using.',
        enum: ['property', 'method'],
      },
    ],
    defaultOptions: ['property'],
  },
  create(context) {
    const options = context.options as [('property' | 'method')?]
    const mode = options?.[0] ?? 'property'

    if (mode === 'property') {
      return createPropertyModeVisitor(context)
    } else {
      return createMethodModeVisitor(context)
    }
  },
}
