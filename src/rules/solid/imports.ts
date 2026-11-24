import type { ESTree, Fix, Rule } from '@oxlint/plugins'
import { appendImports, insertImports, isSolidV2, removeSpecifier } from './utils.ts'

type Source = 'solid-js' | 'solid-js/web' | 'solid-js/store'
type SourceV2 = 'solid-js' | '@solidjs/web'

const primitiveMap = new Map<string, Source>()
for (const primitive of [
  'createSignal',
  'createEffect',
  'createMemo',
  'createResource',
  'onMount',
  'onCleanup',
  'onError',
  'untrack',
  'batch',
  'on',
  'createRoot',
  'getOwner',
  'runWithOwner',
  'mergeProps',
  'splitProps',
  'useTransition',
  'observable',
  'from',
  'mapArray',
  'indexArray',
  'createContext',
  'useContext',
  'children',
  'lazy',
  'createUniqueId',
  'createDeferred',
  'createRenderEffect',
  'createComputed',
  'createReaction',
  'createSelector',
  'DEV',
  'For',
  'Show',
  'Switch',
  'Match',
  'Index',
  'ErrorBoundary',
  'Suspense',
  'SuspenseList',
]) {
  primitiveMap.set(primitive, 'solid-js')
}
for (const primitive of [
  'Portal',
  'render',
  'hydrate',
  'renderToString',
  'renderToStream',
  'isServer',
  'renderToStringAsync',
  'generateHydrationScript',
  'HydrationScript',
  'Dynamic',
]) {
  primitiveMap.set(primitive, 'solid-js/web')
}
for (const primitive of [
  'createStore',
  'produce',
  'reconcile',
  'unwrap',
  'createMutable',
  'modifyMutable',
]) {
  primitiveMap.set(primitive, 'solid-js/store')
}

const typeMap = new Map<string, Source>()
for (const type of [
  'Signal',
  'Accessor',
  'Setter',
  'Resource',
  'ResourceActions',
  'ResourceOptions',
  'ResourceReturn',
  'ResourceFetcher',
  'InitializedResourceReturn',
  'Component',
  'VoidProps',
  'VoidComponent',
  'ParentProps',
  'ParentComponent',
  'FlowProps',
  'FlowComponent',
  'ValidComponent',
  'ComponentProps',
  'Ref',
  'MergeProps',
  'SplitPrips',
  'Context',
  'JSX',
  'ResolvedChildren',
  'MatchProps',
]) {
  typeMap.set(type, 'solid-js')
}
for (const type of ['MountableElement']) {
  typeMap.set(type, 'solid-js/web')
}
for (const type of ['StoreNode', 'Store', 'SetStoreFunction']) {
  typeMap.set(type, 'solid-js/store')
}

const alternateSourceMap = new Map<string, Source>([
  ['createStore', 'solid-js'],
  ['reconcile', 'solid-js'],
  ['Store', 'solid-js'],
  ['StoreNode', 'solid-js'],
  ['SetStoreFunction', 'solid-js'],
])

const primitiveMapV2 = new Map<string, SourceV2>()
for (const primitive of [
  'createSignal',
  'createMemo',
  'createDeferred',
  'createStore',
  'createEffect',
  'createRenderEffect',
  'createTrackedEffect',
  'createProjection',
  'createOptimistic',
  'createOptimisticStore',
  'createReaction',
  'createRoot',
  'createOwner',
  'createContext',
  'useContext',
  'children',
  'lazy',
  'createUniqueId',
  'createErrorBoundary',
  'createLoadingBoundary',
  'createRevealOrder',
  'onCleanup',
  'onSettled',
  'onFlush',
  'untrack',
  'until',
  'from',
  'flush',
  'merge',
  'omit',
  'mapArray',
  'repeat',
  'getOwner',
  'getObserver',
  'runWithOwner',
  'isEqual',
  'isPending',
  'latest',
  'action',
  'reconcile',
  'snapshot',
  'resolve',
  'refresh',
  'flatten',
  'deep',
  'affects',
  'dynamicComponent',
  'isHydrating',
  'DEV',
  'For',
  'Repeat',
  'Show',
  'Switch',
  'Match',
  'Errored',
  'Loading',
  'Reveal',
  'Hydration',
  'NoHydration',
]) {
  primitiveMapV2.set(primitive, 'solid-js')
}
for (const primitive of [
  'Portal',
  'Dynamic',
  'render',
  'hydrate',
  'isServer',
  'renderToString',
  'renderToStream',
  'generateHydrationScript',
  'HydrationScript',
  'dynamic',
  'clientOnly',
  'useHead',
  'getRequestEvent',
  'redirect',
  'reload',
  'respond',
  'httpStatus',
  'httpHeader',
]) {
  primitiveMapV2.set(primitive, '@solidjs/web')
}

const typeMapV2 = new Map<string, SourceV2>()
for (const type of [
  'Signal',
  'Accessor',
  'Setter',
  'Component',
  'Context',
  'ResolvedChildren',
  'Store',
  'StoreNode',
  'StoreSetter',
  'StoreOptions',
  'SignalOptions',
  'MemoOptions',
  'EffectOptions',
  'Owner',
]) {
  typeMapV2.set(type, 'solid-js')
}
typeMapV2.set('JSX', '@solidjs/web')

const sourceRegex = /^solid-js(?:\/web|\/store)?$/
const isSource = (source: string): source is Source => sourceRegex.test(source)

const sourceRegexV2 = /^(?:solid-js|@solidjs\/web)$/
const isSourceV2 = (source: string): source is Source | '@solidjs/web' => sourceRegexV2.test(source)

export const importsRule: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent imports from "solid-js", "solid-js/web", and "solid-js/store".',
      url: 'https://github.com/solidjs/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/imports.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      'prefer-source': 'Prefer importing {{name}} from "{{source}}".',
    },
  },
  createOnce(context) {
    let v2 = false

    return {
      before() {
        v2 = isSolidV2(context)
      },
      ImportDeclaration(node) {
        const source = node.source.value
        if (v2 ? !isSourceV2(source) : !isSource(source)) return

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const isType = specifier.importKind === 'type' || node.importKind === 'type'
            const map = v2 ? (isType ? typeMapV2 : primitiveMapV2) : isType ? typeMap : primitiveMap
            const importedName =
              specifier.imported.type === 'Identifier'
                ? specifier.imported.name
                : specifier.imported.value
            const correctSource = map.get(importedName)
            if (
              correctSource != null &&
              correctSource !== source &&
              (v2 || alternateSourceMap.get(importedName) !== source)
            ) {
              context.report({
                node: specifier,
                messageId: 'prefer-source',
                data: {
                  name: importedName,
                  source: correctSource,
                },
                fix(fixer) {
                  const sourceCode = context.sourceCode
                  const program = sourceCode.ast
                  const correctDeclaration = program.body.find(
                    (n) => n.type === 'ImportDeclaration' && n.source.value === correctSource,
                  ) as ESTree.ImportDeclaration | undefined

                  if (correctDeclaration) {
                    return [
                      removeSpecifier(fixer, sourceCode, specifier),
                      appendImports(fixer, sourceCode, correctDeclaration, [
                        sourceCode.getText(specifier),
                      ]),
                    ].filter(Boolean) as Fix[]
                  }

                  const firstSolidDeclaration = program.body.find(
                    (n) =>
                      n.type === 'ImportDeclaration' &&
                      (v2 ? isSourceV2(n.source.value) : isSource(n.source.value)),
                  ) as ESTree.ImportDeclaration | undefined
                  return [
                    removeSpecifier(fixer, sourceCode, specifier),
                    insertImports(
                      fixer,
                      sourceCode,
                      correctSource,
                      [sourceCode.getText(specifier)],
                      firstSolidDeclaration,
                      node.importKind === 'type',
                    ),
                  ]
                },
              })
            }
          }
        }
      },
    }
  },
}
