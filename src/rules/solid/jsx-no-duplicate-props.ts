import type { ESTree as T } from '@oxlint/plugins'
import { createOnceRule } from './utils.ts'
import { isSolidV2, jsxGetAllProps } from './utils.ts'

export const jsxNoDuplicatePropsRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing the same prop twice in JSX.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-duplicate-props.md',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreCase: {
            type: 'boolean',
            description: 'Consider two prop names differing only by case to be the same.',
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDuplicateProps: 'Duplicate props are not allowed.',
      noDuplicateClass:
        'Duplicate `class` props are not allowed; while it might seem to work, it can break unexpectedly. Use `classList` instead.',
      noDuplicateClassV2:
        'Duplicate `class` props are not allowed; while it might seem to work, it can break unexpectedly. Merge them into one `class` — it accepts arrays and objects: `class={[base, { active: active() }]}`.',
      noDuplicateChildren: 'Using {{used}} at the same time is not allowed.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['JSXOpeningElement'],
  create(context) {
    const v2 = isSolidV2(context)
    return {
      JSXOpeningElement(node) {
        const ignoreCase =
          (context.options[0] as { ignoreCase?: boolean } | undefined)?.ignoreCase ?? false
        const props = new Set()
        const checkPropName = (name: string, node: T.Node) => {
          if (ignoreCase || name.startsWith('on')) {
            name = name
              .toLowerCase()
              .replace(/^on(?:capture)?:/, 'on')
              .replace(/^(?:attr|prop):/, '')
          }
          if (props.has(name)) {
            context.report({
              node,
              messageId:
                name === 'class'
                  ? v2
                    ? 'noDuplicateClassV2'
                    : 'noDuplicateClass'
                  : 'noDuplicateProps',
            })
          }
          props.add(name)
        }

        for (const [name, propNode] of jsxGetAllProps(node.attributes)) {
          checkPropName(name, propNode)
        }

        const hasChildrenProp = props.has('children')
        const hasChildren = (node.parent as T.JSXElement | T.JSXFragment).children.length > 0
        const hasInnerHTML = props.has('innerHTML') || props.has('innerhtml')
        const hasTextContent = props.has('textContent') || props.has('textcontent')
        const used = [
          hasChildrenProp && '`props.children`',
          hasChildren && 'JSX children',
          hasInnerHTML && '`props.innerHTML`',
          hasTextContent && '`props.textContent`',
        ].filter(Boolean)
        if (used.length > 1) {
          context.report({
            node,
            messageId: 'noDuplicateChildren',
            data: {
              used: used.join(', '),
            },
          })
        }
      },
    }
  },
})
