import type { ESTree as T, Fix, Fixer } from '@oxlint/plugins'
import { createOnceRule, findVariable } from './utils.ts'
import { getSolidSourceRegex, jsxGetProp, trackImports } from './utils.ts'

const RENAMED = new Map<string, string>([
  ['equalFn', 'isEqual'],
  ['getListener', 'getObserver'],
])

const RENAMED_CHANGED = new Map<string, [replacement: string, difference: string]>([
  [
    'batch',
    [
      'flush',
      '`flush(fn)` runs `fn` and then drains synchronously; it throws in dev inside an action body and warns inside effect callbacks',
    ],
  ],
  [
    'onMount',
    [
      'onSettled',
      '`onSettled` runs after the tree settles, and its return value is treated as a cleanup, so a callback that returns a non-function value is an error in dev',
    ],
  ],
  [
    'mergeProps',
    [
      'merge',
      'an explicit `undefined` in a later source now overrides an earlier value instead of falling through',
    ],
  ],
  [
    'unwrap',
    [
      'snapshot',
      '`snapshot` returns a copy, not the live underlying object, so identity checks and later store writes are not reflected',
    ],
  ],
])

const REMOVED = new Map<string, string>([
  [
    'createResource',
    'Async derivation is built into Solid 2.0 computations. Use an async `createMemo(async () => ...)` and read it where needed',
  ],
  [
    'createComputed',
    'Use `createMemo` for derived values or the two-argument `createEffect(compute, effect)` for side effects',
  ],
  ['createSelector', 'Use `createProjection` to derive per-key reactive state'],
  [
    'on',
    'Explicit dependencies are built in: use the two-argument `createEffect(compute, effect)` form, where `compute` reads the dependencies',
  ],
  [
    'onError',
    'Use `<Errored>` for error UI, or the `error` option of `createEffect(compute, { effect, error })` to handle errors programmatically',
  ],
  [
    'catchError',
    'Use `<Errored>` for error UI, or the `error` option of `createEffect(compute, { effect, error })` to handle errors programmatically',
  ],
  [
    'resetErrorBoundaries',
    'Error boundaries heal automatically in Solid 2.0 when their sources update',
  ],
  [
    'startTransition',
    'Transitions are built in. Read pending state with `isPending(...)` and previous values with `latest(...)`',
  ],
  [
    'useTransition',
    'Transitions are built in. Read pending state with `isPending(...)` and previous values with `latest(...)`',
  ],
  [
    'observable',
    'To consume an Observable or async iterable, adapt it with `from`; to publish a signal, push values out from a `createEffect`',
  ],
  ['indexArray', 'Use `mapArray`, which handles index-mode mapping in Solid 2.0'],
  ['enableScheduling', 'Scheduling is built into Solid 2.0; there is nothing to enable'],
  [
    'createDynamic',
    'Use the `dynamic(source)` factory from "@solidjs/web", which returns a stable component: `const View = dynamic(() => tag())`, then render `<View {...props} />`',
  ],
  [
    'pipeToWritable',
    'Use `renderToStream(fn).pipeTo(writable)`, or its `readable` stream for a `Response` body',
  ],
  ['pipeToNodeWritable', 'Use `renderToStream(fn).pipe(writable)`'],
  [
    'splitProps',
    'Use `omit` from "solid-js" to exclude props, and pass the original props object along',
  ],
  [
    'renderToStringAsync',
    '`renderToString` awaits async content in Solid 2.0; use it (or `renderToStream`) instead',
  ],
  ['createMutable', 'Use `createStore`; store setters mutate directly in Solid 2.0'],
  ['modifyMutable', 'Use `createStore`; store setters mutate directly in Solid 2.0'],
  [
    'produce',
    'Store setters receive a mutable draft by default in Solid 2.0; mutate directly in the setter',
  ],
  ['Index', 'Use `<For keyed={false}>`, which passes item accessors like `<Index>` did'],
  ['ErrorBoundary', 'Use `<Errored>` to render a fallback when a child throws'],
  ['Suspense', 'Use `<Loading>` to render a fallback while content is pending'],
  [
    'SuspenseList',
    'Use `<Reveal>` to coordinate the reveal order of sibling `<Loading>` boundaries',
  ],
])

const STORE_MOVED = new Set(['createStore', 'reconcile', 'Store', 'StoreNode'])
const STORE_CHANGED = new Map<string, string>([
  [
    'createStore',
    'The setter now takes a single function that mutates a draft (`setStore(s => { s.user.name = v })`); 1.x path and object-merge setter calls no longer work',
  ],
  ['reconcile', 'Its signature is now `reconcile(value, key)`; the 1.x options object is gone'],
])

const SOLID_SOURCE_REGEX = /^(?:solid-js(?:\/web|\/store|\/h|\/html|\/universal)?|@solidjs\/web)$/

const MOVED_MODULES = new Map<string, string>([
  ['solid-js/web', '@solidjs/web'],
  ['solid-js/h', '@solidjs/h'],
  ['solid-js/html', '@solidjs/html'],
  ['solid-js/universal', '@solidjs/universal'],
])

export const removedApiRule = createOnceRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Solid 1.x APIs that were removed or renamed in Solid 2.0, with migration guidance.',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/removed-api.md',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [],
    messages: {
      renamed: "'{{name}}' was renamed to '{{replacement}}' in Solid 2.0.",
      renamedChanged:
        "'{{name}}' was replaced by '{{replacement}}' in Solid 2.0, which behaves differently: {{difference}}. Check each call site before renaming.",
      applyRename: "Rename '{{name}}' to '{{replacement}}'.",
      removed: "'{{name}}' was removed in Solid 2.0. {{guidance}}.",
      webMoved: 'The "solid-js/web" module is now the "@solidjs/web" package in Solid 2.0.',
      moduleMoved: 'The "{{source}}" module is now the "{{replacement}}" package in Solid 2.0.',
      contextProvider:
        'Context objects have no `.Provider` in Solid 2.0; the context is the provider component: `<{{name}} value={...}>`.',
      storeMoved:
        'The "solid-js/store" module no longer exists in Solid 2.0; \'{{name}}\' is exported from "solid-js".',
      storeChanged:
        'The "solid-js/store" module no longer exists in Solid 2.0; \'{{name}}\' is exported from "solid-js". {{guidance}}.',
      classList:
        'The `classList` prop was removed in Solid 2.0; `class` accepts the same object form directly.',
    },
  },
  defaultOptions: [],
  visitorKeys: ['ImportDeclaration', 'JSXOpeningElement', 'JSXAttribute'],
  create(context) {
    const { matchImport, handleImportDeclaration } = trackImports(getSolidSourceRegex(context))

    const isSolidContext = (name: T.JSXIdentifier): boolean => {
      const variable = findVariable(context, name as unknown as T.Node & { name: string })
      const def = variable?.defs[0]
      if (!def || def.node.type !== 'VariableDeclarator') return false
      const init = def.node.init
      return Boolean(
        init?.type === 'CallExpression' &&
        init.callee.type === 'Identifier' &&
        matchImport('createContext', init.callee.name),
      )
    }

    const renameFix = (
      fixer: Fixer,
      specifier: T.ImportSpecifier,
      replacement: string,
    ): Array<Fix> => {
      const fixes: Array<Fix> = []
      const aliased = specifier.local.range[0] !== specifier.imported.range[0]
      fixes.push(fixer.replaceText(specifier.imported, replacement))
      if (!aliased) {
        const variable = findVariable(context, specifier.local)
        if (variable) {
          for (const reference of variable.references) {
            if (reference.identifier !== specifier.local) {
              fixes.push(fixer.replaceText(reference.identifier, replacement))
            }
          }
        }
      }
      return fixes
    }

    return {
      ImportDeclaration(node) {
        handleImportDeclaration(node)
        const source = node.source.value
        if (!SOLID_SOURCE_REGEX.test(source)) return

        const movedTo = MOVED_MODULES.get(source)
        if (movedTo) {
          context.report({
            node: node.source,
            messageId: source === 'solid-js/web' ? 'webMoved' : 'moduleMoved',
            data: { source, replacement: movedTo },
            fix: (fixer) =>
              fixer.replaceText(node.source, node.source.raw.replace(source, movedTo)),
          })
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue
          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value

          const replacement = RENAMED.get(importedName)
          if (replacement) {
            context.report({
              node: specifier,
              messageId: 'renamed',
              data: { name: importedName, replacement },
              fix: (fixer) => renameFix(fixer, specifier, replacement),
            })
            continue
          }

          const changed = RENAMED_CHANGED.get(importedName)
          if (changed) {
            const [changedReplacement, difference] = changed
            const data = { name: importedName, replacement: changedReplacement, difference }
            context.report({
              node: specifier,
              messageId: 'renamedChanged',
              data,
              suggest: [
                {
                  messageId: 'applyRename',
                  data,
                  fix: (fixer) => renameFix(fixer, specifier, changedReplacement),
                },
              ],
            })
            continue
          }

          const guidance = REMOVED.get(importedName)
          if (guidance) {
            context.report({
              node: specifier,
              messageId: 'removed',
              data: { name: importedName, guidance },
            })
            continue
          }

          if (source === 'solid-js/store' && STORE_MOVED.has(importedName)) {
            const storeGuidance = STORE_CHANGED.get(importedName)
            context.report({
              node: specifier,
              messageId: storeGuidance ? 'storeChanged' : 'storeMoved',
              data: { name: importedName, guidance: storeGuidance },
              fix: node.specifiers.every(
                (s: T.ImportDeclarationSpecifier) =>
                  s.type === 'ImportSpecifier' &&
                  STORE_MOVED.has(
                    s.imported.type === 'Identifier' ? s.imported.name : s.imported.value,
                  ),
              )
                ? (fixer) =>
                    fixer.replaceText(
                      node.source,
                      node.source.raw.replace('solid-js/store', 'solid-js'),
                    )
                : undefined,
            })
          }
        }
      },
      JSXOpeningElement(node) {
        const name = node.name
        if (
          name.type !== 'JSXMemberExpression' ||
          name.property.name !== 'Provider' ||
          name.object.type !== 'JSXIdentifier' ||
          !isSolidContext(name.object)
        ) {
          return
        }
        const contextName = name.object.name
        const closing = (node.parent as T.JSXElement).closingElement
        context.report({
          node: name,
          messageId: 'contextProvider',
          data: { name: contextName },
          fix: (fixer) => {
            const fixes = [fixer.replaceText(name, contextName)]
            if (closing) fixes.push(fixer.replaceText(closing.name, contextName))
            return fixes
          },
        })
      },
      JSXAttribute(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'classList') {
          const element = node.parent as T.JSXOpeningElement
          const hasClass = !!jsxGetProp(element.attributes, 'class')
          context.report({
            node: node.name,
            messageId: 'classList',
            fix: hasClass ? undefined : (fixer) => fixer.replaceText(node.name, 'class'),
          })
        }
      },
    }
  },
})
