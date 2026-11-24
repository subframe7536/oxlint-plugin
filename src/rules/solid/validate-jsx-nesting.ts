import type { ESTree as T } from '@oxlint/plugins'
import { parse, parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { isValidHTMLNesting } from 'validate-html-nesting'
import { createOnceRule } from './utils.ts'
import { isDOMElementName, jsxPropName } from './utils.ts'

/**
 * `<body>` from a parsed document, used as the parsing context so fragments are
 * interpreted the way `innerHTML` would interpret them.
 */
type ParentNode = DefaultTreeAdapterMap['parentNode']
type ChildNode = DefaultTreeAdapterMap['childNode']

const htmlElement = parse('<!DOCTYPE html><html><head></head><body></body></html>')
  .childNodes[1] as ParentNode
const bodyContext = htmlElement.childNodes[1] as ParentNode

type Namespace = 'html' | 'svg' | 'math'

const rewriteCache = new Map<string, boolean>()
const tableWrappers: Record<string, string[]> = {
  caption: ['table'],
  colgroup: ['table'],
  tbody: ['table'],
  thead: ['table'],
  tfoot: ['table'],
  tr: ['table', 'tbody'],
  td: ['table', 'tbody', 'tr'],
  th: ['table', 'tbody', 'tr'],
}

/** Void elements take no end tag, and the parser would read `</br>` as another `<br>`. */
const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

/** parse5 lowercases tag names outside SVG, so `<foreignObject>` comes back as `foreignobject`. */
const isTag = (node: ChildNode, tag: string): boolean =>
  node.nodeName.toLowerCase() === tag.toLowerCase()

const parserRewrites = (parent: string, child: string, namespace: Namespace): boolean => {
  const key = `${namespace}:${parent}>${child}`
  const cached = rewriteCache.get(key)
  if (cached !== undefined) return cached

  const foreign = namespace !== 'html'
  const wrappers = foreign ? [namespace] : (tableWrappers[parent] ?? [])
  const documentParent = !foreign && (parent === 'head' || parent === 'body')
  const childMarkup = voidElements.has(child) ? `<${child}>` : `<${child}></${child}>`
  const markup = wrappers.reduceRight(
    (content, tag) => `<${tag}>${content}</${tag}>`,
    `<${parent}>${childMarkup}</${parent}>`,
  )
  let fragment: ParentNode | undefined = documentParent
    ? (parse(markup).childNodes.find((node) => node.nodeName === 'html') as ParentNode | undefined)
    : parseFragment(bodyContext, markup, {})
  for (const tag of wrappers) {
    fragment = fragment?.childNodes.find((node) => node.nodeName === tag) as ParentNode | undefined
  }
  const roots = (fragment?.childNodes ?? []).filter((n) => n.nodeName !== '#text')
  const root = documentParent
    ? roots.find((node) => node.nodeName === parent)
    : roots.length === 1 && isTag(roots[0], parent)
      ? roots[0]
      : undefined
  const container =
    root && 'content' in root ? (root.content as ParentNode) : (root as ParentNode | undefined)
  const kids: ChildNode[] = (container?.childNodes ?? []).filter((n) => n.nodeName !== '#text')

  const rewritten =
    (!root || kids.length !== 1 || !isTag(kids[0], child)) &&
    (!foreign || parserRewrites(parent, child, 'html'))
  rewriteCache.set(key, rewritten)
  return rewritten
}

const getDOMTagName = (node: T.JSXElement): string | null => {
  const name = node.openingElement.name
  return name.type === 'JSXIdentifier' && isDOMElementName(name.name) ? name.name : null
}

const isTransparent = (node: T.Node): boolean =>
  node.type === 'TSAsExpression' ||
  node.type === 'TSNonNullExpression' ||
  node.type === 'TSSatisfiesExpression'

const getDOMParent = (node: T.JSXElement): T.JSXElement | null => {
  let current: T.Node = node
  let parent: T.Node | undefined = current.parent

  while (parent) {
    switch (parent.type) {
      case 'JSXElement':
        return parent.children.includes(current as T.JSXChild) ? parent : null
      case 'JSXAttribute':
        return parent.name.type === 'JSXIdentifier' &&
          parent.name.name === 'children' &&
          parent.parent?.type === 'JSXOpeningElement' &&
          parent.parent.parent?.type === 'JSXElement'
          ? parent.parent.parent
          : null
      case 'JSXFragment':
      case 'JSXExpressionContainer':
      case 'ArrayExpression':
        current = parent
        parent = parent.parent ?? undefined
        break
      case 'LogicalExpression':
        if (parent.right !== current) return null
        current = parent
        parent = parent.parent ?? undefined
        break
      case 'ConditionalExpression':
        if (parent.test === current) return null
        current = parent
        parent = parent.parent ?? undefined
        break
      default:
        if (!isTransparent(parent)) return null
        current = parent
        parent = parent.parent ?? undefined
    }
  }
  return null
}

const isInserted = (node: T.JSXElement, parent: T.JSXElement): boolean => {
  let current: T.Node | null | undefined = node.parent
  while (current && current !== parent) {
    if (current.type === 'JSXExpressionContainer' || current.type === 'JSXAttribute') return true
    current = current.parent
  }
  return false
}

const svgIntegrationPoints = new Set(['foreignobject', 'desc', 'title'])
const mathIntegrationPoints = new Set(['mi', 'mo', 'mn', 'ms', 'mtext'])
const mathTextLeaves = new Set(['mglyph', 'malignmark'])

const foreignContentExits = new Set([
  'b',
  'big',
  'blockquote',
  'body',
  'br',
  'center',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'hr',
  'i',
  'img',
  'li',
  'listing',
  'menu',
  'meta',
  'nobr',
  'ol',
  'p',
  'pre',
  'ruby',
  's',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'table',
  'tt',
  'u',
  'ul',
  'var',
])

const fontExitAttributes = new Set(['color', 'face', 'size'])
const htmlAnnotationEncodings = new Set(['text/html', 'application/xhtml+xml'])

const switchesToHTML = (
  element: T.JSXElement,
  tag: string,
  namespace: Exclude<Namespace, 'html'>,
): boolean => {
  if (foreignContentExits.has(tag)) return true
  const { attributes } = element.openingElement
  if (tag === 'font') {
    return attributes.some(
      (attr) =>
        attr.type === 'JSXAttribute' && fontExitAttributes.has(jsxPropName(attr).toLowerCase()),
    )
  }
  if (namespace === 'svg') return svgIntegrationPoints.has(tag)
  if (tag === 'annotation-xml') {
    const encoding = attributes.find(
      (attr): attr is T.JSXAttribute =>
        attr.type === 'JSXAttribute' && jsxPropName(attr).toLowerCase() === 'encoding',
    )?.value
    return (
      encoding?.type === 'Literal' &&
      typeof encoding.value === 'string' &&
      htmlAnnotationEncodings.has(encoding.value.toLowerCase())
    )
  }
  return mathIntegrationPoints.has(tag)
}

const startsNamespace = (tag: string, namespace: Namespace, parentTag: string): boolean =>
  namespace === 'html' || (tag === 'svg' && namespace === 'math' && parentTag === 'annotation-xml')

const getParsingNamespace = (node: T.JSXElement): Namespace => {
  const elements: Array<[T.JSXElement, string]> = []
  for (let current: T.Node | null | undefined = node; current; current = current.parent) {
    if (current.type !== 'JSXElement') continue
    const tag = getDOMTagName(current)
    if (tag) elements.push([current, tag.toLowerCase()])
  }
  let namespace: Namespace = 'html'
  let parent: [T.JSXElement, string, Namespace] | undefined
  for (const [element, tag] of elements.reverse()) {
    const outer = parent && element.parent === parent[0] ? parent : undefined
    const own: Namespace =
      outer && outer[2] === 'math' && mathIntegrationPoints.has(outer[1]) && mathTextLeaves.has(tag)
        ? 'math'
        : namespace
    if (element === node) return own
    if (tag === 'svg' || tag === 'math') {
      namespace = !outer || startsNamespace(tag, own, outer[1]) ? tag : own
    } else {
      namespace = own !== 'html' && switchesToHTML(element, tag, own) ? 'html' : own
    }
    parent = [element, tag, own]
  }
  return namespace
}

export const validateJsxNestingRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow HTML nesting the browser refuses to keep, like `<p><div /></p>`, which silently renders a different DOM than the JSX describes.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/validate-jsx-nesting.md',
    },
    schema: [],
    messages: {
      invalidNesting:
        "Invalid HTML nesting: `<{{child}}>` cannot be a child of `<{{parent}}>`. The HTML parser restructures this, so the rendered DOM won't match this markup.",
      invalidNestingInserted:
        "Invalid HTML nesting: `<{{child}}>` cannot be a child of `<{{parent}}>`. The client inserts it as written, but the HTML parser restructures it in server-rendered HTML, so hydration won't match this markup.",
    },
  },
  defaultOptions: [],
  visitorKeys: ['JSXElement'],
  create(context) {
    const check = (node: T.JSXElement, child: string, parentNode: T.JSXElement) => {
      const parent = getDOMTagName(parentNode)
      if (!parent) return
      if (isValidHTMLNesting(parent, child)) return
      if (!parserRewrites(parent, child, getParsingNamespace(parentNode))) return

      context.report({
        node: node.openingElement.name,
        messageId: isInserted(node, parentNode) ? 'invalidNestingInserted' : 'invalidNesting',
        data: { parent, child },
      })
    }

    return {
      JSXElement(node) {
        const child = getDOMTagName(node)
        if (!child) return

        const parentNode = getDOMParent(node)
        if (parentNode) check(node, child, parentNode)
      },
    }
  },
})
