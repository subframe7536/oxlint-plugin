import type { ESTree, Rule } from '@oxlint/plugins'
import { isDOMElementName, isSolidV2 } from './utils.ts'

const knownNamespaces = ['on', 'oncapture', 'use', 'prop', 'attr', 'bool']
const styleNamespaces = ['style', 'class']
const otherNamespaces = ['xmlns', 'xlink']

const v2MigrationGuidance: Record<string, string> = {
  on: 'For an event handler, use the camelCase form instead: `onClick`',
  oncapture:
    'There is no capture-phase prefix in Solid 2.0; add a capture listener with `addEventListener` in a `ref` if needed',
  use: 'Directives were removed in Solid 2.0; pass a directive factory to `ref` instead: `ref={myDirective(options)}`, with owned setup in the factory and element work in the callback it returns',
  attr: 'Use the plain attribute name; attributes are the default in Solid 2.0',
  bool: 'Use the plain attribute with a boolean or conditional value',
}

export const noUnknownNamespacesRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Enforce using only Solid-specific namespaced attribute names (i.e. `'on:'` in `<div on:click={...} />`).",
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-unknown-namespaces.md',
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowedNamespaces: {
            description: 'an array of additional namespace names to allow',
            type: 'array',
            items: {
              type: 'string',
            },
            default: [],
            minItems: 1,
            uniqueItems: true,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unknown: `'{{namespace}}:' is not one of Solid's special prefixes for JSX attributes (${knownNamespaces
        .map((n) => `'${n}:'`)
        .join(', ')}).`,
      style:
        "Using the '{{namespace}}:' special prefix is potentially confusing, prefer the '{{namespace}}' prop instead.",
      component: 'Namespaced props have no effect on components.',
      'component-suggest': 'Replace {{namespace}}:{{name}} with {{name}}.',
      v2Namespace:
        "'{{namespace}}:' is not a special prefix in Solid 2.0; this renders a literal '{{namespace}}:{{name}}' attribute. {{guidance}}.",
    },
  },
  createOnce(context) {
    let explicitlyAllowedNamespaces: string[] | undefined
    let v2 = false

    return {
      before() {
        explicitlyAllowedNamespaces = (context.options as [{ allowedNamespaces?: string[] }?])[0]
          ?.allowedNamespaces
        v2 = isSolidV2(context)
      },
      'JSXAttribute > JSXNamespacedName'(node: ESTree.JSXNamespacedName) {
        const openingElement = (node.parent as ESTree.JSXAttribute)
          .parent as ESTree.JSXOpeningElement
        if (
          openingElement.name.type === 'JSXIdentifier' &&
          !isDOMElementName(openingElement.name.name)
        ) {
          context.report({
            node,
            messageId: 'component',
            suggest: [
              {
                messageId: 'component-suggest',
                data: { namespace: node.namespace.name, name: node.name.name },
                fix: (fixer) => fixer.replaceText(node, node.name.name),
              },
            ],
          })
          return
        }

        const namespace = node.namespace?.name

        if (v2) {
          const guidance = v2MigrationGuidance[namespace]
          if (guidance && !explicitlyAllowedNamespaces?.includes(namespace)) {
            context.report({
              node,
              messageId: 'v2Namespace',
              data: { namespace, name: node.name.name, guidance },
            })
          }
          return
        }

        if (
          !(
            knownNamespaces.includes(namespace) ||
            otherNamespaces.includes(namespace) ||
            explicitlyAllowedNamespaces?.includes(namespace)
          )
        ) {
          if (styleNamespaces.includes(namespace)) {
            context.report({
              node,
              messageId: 'style',
              data: { namespace },
            })
          } else {
            context.report({
              node,
              messageId: 'unknown',
              data: { namespace },
            })
          }
        }
      },
    }
  },
}
