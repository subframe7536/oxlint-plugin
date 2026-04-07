import type { Rule, ESTree } from '@oxlint/plugins'
import { jsxGetAllProps } from './utils.ts'

export const jsxNoDuplicatePropsRule: Rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing the same prop twice in JSX.',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-duplicate-props.md',
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
      noDuplicateChildren: 'Using {{used}} at the same time is not allowed.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const ignoreCase = (context.options as [{ ignoreCase?: boolean }?])[0]?.ignoreCase ?? false
        const props = new Set<string>()

        const checkPropName = (name: string, propNode: ESTree.Node) => {
          // Normalize attr/prop namespace prefixes first (attr:class -> class)
          let normalizedName = name.replace(/^(?:attr|prop):/, '')

          // Normalize event handler names and case when requested
          if (ignoreCase || normalizedName.startsWith('on')) {
            normalizedName = normalizedName.toLowerCase().replace(/^on(?:capture)?:/, 'on')
          }

          if (props.has(normalizedName)) {
            context.report({
              node: propNode,
              messageId: normalizedName === 'class' ? 'noDuplicateClass' : 'noDuplicateProps',
            })
          }
          props.add(normalizedName)
        }

        for (const [name, propNode] of jsxGetAllProps(node.attributes)) {
          checkPropName(name, propNode)
        }

        const hasChildrenProp = props.has('children')
        const parentNode = node.parent as ESTree.JSXElement | ESTree.JSXFragment
        const hasChildren = 'children' in parentNode && (parentNode.children?.length ?? 0) > 0
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
            data: { used: used.join(', ') },
          })
        }
      },
    }
  },
}
