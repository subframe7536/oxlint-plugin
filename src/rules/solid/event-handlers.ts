import type { ESTree, Rule } from '@oxlint/plugins'
import { getStaticValue, isDOMElementName, isSolidV2 } from './utils.ts'

const COMMON_EVENTS = [
  'onAbort',
  'onAnimationCancel',
  'onAnimationEnd',
  'onAnimationIteration',
  'onAnimationStart',
  'onAuxClick',
  'onBeforeCopy',
  'onBeforeCut',
  'onBeforeInput',
  'onBeforeMatch',
  'onBeforePaste',
  'onBeforeToggle',
  'onBeforeXRSelect',
  'onBlur',
  'onCancel',
  'onCanPlay',
  'onCanPlayThrough',
  'onChange',
  'onClick',
  'onClose',
  'onCompositionEnd',
  'onCompositionStart',
  'onCompositionUpdate',
  'onContentVisibilityAutoStateChange',
  'onContextLost',
  'onContextMenu',
  'onContextRestored',
  'onCopy',
  'onCueChange',
  'onCut',
  'onDblClick',
  'onDrag',
  'onDragEnd',
  'onDragEnter',
  'onDragExit',
  'onDragLeave',
  'onDragOver',
  'onDragStart',
  'onDrop',
  'onDurationChange',
  'onEmptied',
  'onEnded',
  'onError',
  'onFocus',
  'onFocusIn',
  'onFocusOut',
  'onFormData',
  'onFullscreenChange',
  'onFullscreenError',
  'onGotPointerCapture',
  'onInput',
  'onInvalid',
  'onKeyDown',
  'onKeyPress',
  'onKeyUp',
  'onLoad',
  'onLoadedData',
  'onLoadedMetadata',
  'onLoadStart',
  'onLostPointerCapture',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onMouseOut',
  'onMouseOver',
  'onMouseUp',
  'onPaste',
  'onPause',
  'onPlay',
  'onPlaying',
  'onPointerCancel',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerMove',
  'onPointerOut',
  'onPointerOver',
  'onPointerRawUpdate',
  'onPointerUp',
  'onProgress',
  'onRateChange',
  'onReset',
  'onResize',
  'onScroll',
  'onScrollEnd',
  'onSecurityPolicyViolation',
  'onSeeked',
  'onSeeking',
  'onSelect',
  'onSelectionChange',
  'onSelectStart',
  'onSlotChange',
  'onStalled',
  'onSubmit',
  'onSuspend',
  'onTimeUpdate',
  'onToggle',
  'onTouchCancel',
  'onTouchEnd',
  'onTouchMove',
  'onTouchStart',
  'onTransitionCancel',
  'onTransitionEnd',
  'onTransitionRun',
  'onTransitionStart',
  'onVolumeChange',
  'onWaiting',
  'onWheel',
] as const

type CommonEvent = (typeof COMMON_EVENTS)[number]

const COMMON_EVENTS_MAP = new Map<string, CommonEvent>()
for (const event of COMMON_EVENTS) {
  COMMON_EVENTS_MAP.set(event.toLowerCase(), event)
}

const NONSTANDARD_EVENTS_MAP: Record<string, string> = {
  ondoubleclick: 'onDblClick',
}

export const eventHandlersRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforce naming DOM element event handlers consistently and prevent Solid's analysis from misunderstanding whether a prop should be an event handler.",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/event-handlers.md',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          ignoreCase: {
            type: 'boolean',
            description:
              "if true, don't warn on ambiguously named event handlers like `onclick` or `onchange`",
            default: false,
          },
          warnOnSpread: {
            type: 'boolean',
            description:
              'if true, warn when spreading event handlers onto JSX. Enable for Solid < v1.6.',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      'detected-attr':
        'The {{name}} prop is named as an event handler (starts with "on"), but Solid knows its value ({{staticValue}}) is a string or number, so it will be treated as an attribute. If this is intentional, name this prop attr:{{name}}.',
      naming:
        'The {{name}} prop is ambiguous. If it is an event handler, change it to {{handlerName}}. If it is an attribute, change it to {{attrName}}.',
      capitalization: 'The {{name}} prop should be renamed to {{fixedName}} for readability.',
      nonstandard:
        "The {{name}} prop should be renamed to {{fixedName}}, because it's not a standard event handler.",
      'make-handler': 'Change the {{name}} prop to {{handlerName}}.',
      'make-attr': 'Change the {{name}} prop to {{attrName}}.',
      'spread-handler':
        "The {{name}} prop should be added as a JSX attribute, not spread in. Solid doesn't add listeners when spreading into JSX.",
      'lowercase-attribute-v2':
        'In Solid 2.0, {{name}} is a literal attribute, not an event handler — this listener will never fire. Rename it to {{fixedName}}.',
      'static-handler-v2':
        'In Solid 2.0, {{name}} is an event handler and must be a function, but its value is the static value {{staticValue}}. For a literal attribute, use lowercase {{attrName}}.',
    },
  },
  createOnce(context) {
    let ignoreCase = false
    let warnOnSpread = false
    let v2 = false

    return {
      before() {
        const opts =
          (context.options as [{ ignoreCase?: boolean; warnOnSpread?: boolean }?])[0] ?? {}
        ignoreCase = opts.ignoreCase ?? false
        warnOnSpread = opts.warnOnSpread ?? false
        v2 = isSolidV2(context)
      },
      JSXAttribute(node) {
        const openingElement = node.parent as ESTree.JSXOpeningElement
        if (
          openingElement.name.type !== 'JSXIdentifier' ||
          !isDOMElementName(openingElement.name.name)
        ) {
          return
        }

        if (node.name.type === 'JSXNamespacedName') {
          return
        }

        const { name } = node.name
        if (!/^on[a-zA-Z]/.test(name)) {
          return
        }

        if (v2) {
          const isCamelCase = name[2] === name[2].toUpperCase()
          const lowercaseName = name.toLowerCase()

          if (isCamelCase) {
            let camelStaticValue: { value: unknown } | null = null
            if (
              node.value?.type === 'JSXExpressionContainer' &&
              node.value.expression.type !== 'JSXEmptyExpression' &&
              node.value.expression.type !== 'ArrayExpression'
            ) {
              camelStaticValue = getStaticValue(
                node.value.expression,
                context.sourceCode.getScope(node),
              )
            }
            if (node.value === null || node.value?.type === 'Literal') {
              camelStaticValue = {
                value: node.value !== null ? (node.value as { value: unknown }).value : true,
              }
            }
            if (
              camelStaticValue !== null &&
              (typeof camelStaticValue.value === 'string' ||
                typeof camelStaticValue.value === 'number' ||
                typeof camelStaticValue.value === 'boolean')
            ) {
              context.report({
                node,
                messageId: 'static-handler-v2',
                data: {
                  name,
                  staticValue: String(camelStaticValue.value),
                  attrName: lowercaseName,
                },
              })
            } else if (NONSTANDARD_EVENTS_MAP[lowercaseName]) {
              const fixedName = NONSTANDARD_EVENTS_MAP[lowercaseName]
              context.report({
                node: node.name,
                messageId: 'nonstandard',
                data: { name, fixedName },
                fix: (fixer) => fixer.replaceText(node.name, fixedName),
              })
            }
          } else {
            const isStaticAttributeValue =
              node.value === null ||
              node.value.type === 'Literal' ||
              (node.value.type === 'JSXExpressionContainer' &&
                node.value.expression.type !== 'JSXEmptyExpression' &&
                node.value.expression.type !== 'ArrayExpression' &&
                getStaticValue(node.value.expression, context.sourceCode.getScope(node)) !== null)
            if (!isStaticAttributeValue) {
              const nonstd = NONSTANDARD_EVENTS_MAP[lowercaseName]
              const common = COMMON_EVENTS_MAP.get(lowercaseName)
              const fixedName = nonstd ?? common ?? `on${name[2].toUpperCase()}${name.slice(3)}`
              const known = Boolean(nonstd || common)
              context.report({
                node: node.name,
                messageId: 'lowercase-attribute-v2',
                data: { name, fixedName },
                fix: known ? (fixer) => fixer.replaceText(node.name, fixedName) : undefined,
                suggest: known
                  ? undefined
                  : [
                      {
                        messageId: 'make-handler',
                        data: { name, handlerName: fixedName },
                        fix: (fixer) => fixer.replaceText(node.name, fixedName),
                      },
                    ],
              })
            }
          }
          return
        }

        let staticValue: { value: unknown } | null = null
        if (
          node.value?.type === 'JSXExpressionContainer' &&
          node.value.expression.type !== 'JSXEmptyExpression' &&
          node.value.expression.type !== 'ArrayExpression' &&
          (staticValue = getStaticValue(
            node.value.expression,
            context.sourceCode.getScope(node),
          )) !== null &&
          (typeof staticValue.value === 'string' || typeof staticValue.value === 'number')
        ) {
          context.report({
            node,
            messageId: 'detected-attr',
            data: {
              name,
              staticValue: String(staticValue.value),
            },
          })
        } else if (node.value === null || node.value?.type === 'Literal') {
          context.report({
            node,
            messageId: 'detected-attr',
            data: {
              name,
              staticValue: String(
                node.value !== null ? (node.value as { value: unknown }).value : true,
              ),
            },
          })
        } else if (!ignoreCase) {
          const lowercaseHandlerName = name.toLowerCase()
          if (NONSTANDARD_EVENTS_MAP[lowercaseHandlerName]) {
            const fixedName = NONSTANDARD_EVENTS_MAP[lowercaseHandlerName]
            context.report({
              node: node.name,
              messageId: 'nonstandard',
              data: { name, fixedName },
              fix: (fixer) => fixer.replaceText(node.name, fixedName),
            })
          } else if (COMMON_EVENTS_MAP.has(lowercaseHandlerName)) {
            const fixedName = COMMON_EVENTS_MAP.get(lowercaseHandlerName)!
            if (fixedName !== name) {
              context.report({
                node: node.name,
                messageId: 'capitalization',
                data: { name, fixedName },
                fix: (fixer) => fixer.replaceText(node.name, fixedName),
              })
            }
          } else if (name[2] === name[2].toLowerCase()) {
            const handlerName = `on${name[2].toUpperCase()}${name.slice(3)}`
            const attrName = `attr:${name}`
            context.report({
              node: node.name,
              messageId: 'naming',
              data: { name, attrName, handlerName },
              suggest: [
                {
                  messageId: 'make-handler',
                  data: { name, handlerName },
                  fix: (fixer) => fixer.replaceText(node.name, handlerName),
                },
                {
                  messageId: 'make-attr',
                  data: { name, attrName },
                  fix: (fixer) => fixer.replaceText(node.name, attrName),
                },
              ],
            })
          }
        }
      },
      Property(node) {
        if (
          warnOnSpread &&
          node.parent?.type === 'ObjectExpression' &&
          node.parent.parent?.type === 'JSXSpreadAttribute' &&
          node.parent.parent.parent?.type === 'JSXOpeningElement'
        ) {
          const openingElement = node.parent.parent.parent as ESTree.JSXOpeningElement
          if (
            openingElement.name.type === 'JSXIdentifier' &&
            isDOMElementName(openingElement.name.name)
          ) {
            if (node.key.type === 'Identifier' && /^on/.test(node.key.name)) {
              const handlerName = node.key.name
              const sourceCode = context.sourceCode
              context.report({
                node,
                messageId: 'spread-handler',
                data: { name: node.key.name },
                *fix(fixer) {
                  const commaAfter = sourceCode.getTokenAfter(node)
                  yield fixer.remove(
                    (node.parent as ESTree.ObjectExpression).properties.length === 1
                      ? (node.parent.parent as ESTree.Node)
                      : node,
                  )
                  if (commaAfter?.value === ',') {
                    yield fixer.remove(commaAfter)
                  }
                  yield fixer.insertTextAfter(
                    node.parent.parent as ESTree.Node,
                    ` ${handlerName}={${sourceCode.getText(node.value)}}`,
                  )
                },
              })
            }
          }
        }
      },
    }
  },
}
