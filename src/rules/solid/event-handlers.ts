import type { Rule, ESTree } from '@oxlint/plugins'
import { isDOMElementName } from './utils.ts'

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

function jsxAttrName(node: ESTree.JSXAttribute): string {
  if (node.name.type === 'JSXNamespacedName') {
    const ns = node.name as ESTree.JSXNamespacedName
    return `${ns.namespace.name}:${ns.name.name}`
  }
  return (node.name as ESTree.JSXIdentifier).name
}

export const eventHandlersRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforce naming DOM element event handlers consistently and prevent Solid's analysis from misunderstanding whether a prop should be an event handler.",
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/event-handlers.md',
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
    },
  },
  createOnce(context) {
    let ignoreCase: boolean
    let warnOnSpread: boolean

    return {
      before() {
        const options =
          (context.options as [{ ignoreCase?: boolean; warnOnSpread?: boolean }?])[0] ?? {}
        ignoreCase = options.ignoreCase ?? false
        warnOnSpread = options.warnOnSpread ?? false
      },
      JSXAttribute(node) {
        const openingElement = node.parent as ESTree.JSXOpeningElement
        if (
          openingElement.name.type !== 'JSXIdentifier' ||
          !isDOMElementName((openingElement.name as ESTree.JSXIdentifier).name)
        ) {
          return
        }

        const propName = jsxAttrName(node)
        if (!propName.toLowerCase().startsWith('on')) return

        // Namespaced: on:click, attr:onclick, etc.
        if (propName.includes(':')) return

        const lowerPropName = propName.toLowerCase()

        // Check if it has a static string/number value
        if (node.value) {
          const valueNode =
            node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value
          if (valueNode.type !== 'JSXEmptyExpression') {
            let staticValue: string | number | null = null
            if (valueNode.type === 'Literal') {
              const v = (valueNode as { value: unknown }).value
              if (typeof v === 'string' || typeof v === 'number') {
                staticValue = v
              }
            }
            if (staticValue !== null) {
              context.report({
                node,
                messageId: 'detected-attr',
                data: { name: propName, staticValue: String(staticValue) },
              })
              return
            }
          }
        }

        // Check for nonstandard events
        if (NONSTANDARD_EVENTS_MAP[lowerPropName]) {
          const fixedName = NONSTANDARD_EVENTS_MAP[lowerPropName]!
          context.report({
            node: node.name,
            messageId: 'nonstandard',
            data: { name: propName, fixedName },
            fix: (fixer) => fixer.replaceText(node.name, fixedName),
          })
          return
        }

        // Check if it's a known event with incorrect capitalization
        if (COMMON_EVENTS_MAP.has(lowerPropName)) {
          const fixedName = COMMON_EVENTS_MAP.get(lowerPropName)!
          if (propName !== fixedName) {
            context.report({
              node: node.name,
              messageId: 'capitalization',
              data: { name: propName, fixedName },
              fix: (fixer) => fixer.replaceText(node.name, fixedName),
            })
          }
          return
        }

        // Ambiguous: on* but not a known event
        if (!ignoreCase) {
          const handlerName = propName[0]!.toUpperCase() + propName.slice(1)
          const attrName = `attr:${propName}`
          context.report({
            node: node.name,
            messageId: 'naming',
            data: { name: propName, handlerName, attrName },
            suggest: [
              {
                messageId: 'make-handler',
                data: { name: propName, handlerName },
                fix: (fixer) => fixer.replaceText(node.name, handlerName),
              },
              {
                messageId: 'make-attr',
                data: { name: propName, attrName },
                fix: (fixer) => fixer.replaceText(node.name, attrName),
              },
            ],
          })
        }
      },
      JSXSpreadAttribute(node) {
        if (!warnOnSpread) return
        const openingElement = node.parent as ESTree.JSXOpeningElement
        if (
          openingElement.name.type !== 'JSXIdentifier' ||
          !isDOMElementName((openingElement.name as ESTree.JSXIdentifier).name)
        ) {
          return
        }
        if (node.argument.type === 'ObjectExpression') {
          for (const prop of (node.argument as ESTree.ObjectExpression).properties) {
            if (prop.type === 'Property') {
              const objProp = prop as ESTree.ObjectProperty
              let name: string | null = null
              if (objProp.key.type === 'Identifier') {
                name = (objProp.key as ESTree.IdentifierName).name
              } else if (objProp.key.type === 'Literal') {
                const v = (objProp.key as { value: unknown }).value
                if (typeof v === 'string') name = v
              }
              if (name && COMMON_EVENTS_MAP.has(name.toLowerCase())) {
                context.report({
                  node: objProp.key,
                  messageId: 'spread-handler',
                  data: { name },
                })
              }
            }
          }
        }
      },
    }
  },
}
