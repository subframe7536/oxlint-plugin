import type { Rule, ESTree, Fix } from '@oxlint/plugins'
import { appendImports, insertImports, removeSpecifier } from './utils.ts'

type Source = 'solid-js' | 'solid-js/web' | 'solid-js/store'

const primitiveMap = new Map<string, Source>()
for (const p of [
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
  primitiveMap.set(p, 'solid-js')
}
for (const p of [
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
  primitiveMap.set(p, 'solid-js/web')
}
for (const p of [
  'createStore',
  'produce',
  'reconcile',
  'unwrap',
  'createMutable',
  'modifyMutable',
]) {
  primitiveMap.set(p, 'solid-js/store')
}

const typeMap = new Map<string, Source>()
for (const t of [
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
  'SplitProps',
  'Context',
  'JSX',
  'ResolvedChildren',
  'MatchProps',
]) {
  typeMap.set(t, 'solid-js')
}
for (const t of ['MountableElement']) {
  typeMap.set(t, 'solid-js/web')
}
for (const t of ['StoreNode', 'Store', 'SetStoreFunction']) {
  typeMap.set(t, 'solid-js/store')
}

const sourceRegex = /^solid-js(?:\/web|\/store)?$/
const isSource = (source: string): source is Source => sourceRegex.test(source)

function getImportedName(specifier: ESTree.ImportSpecifier): string {
  const imported = specifier.imported
  if (imported.type === 'Identifier') {
    return (imported as ESTree.IdentifierReference).name
  }
  if (imported.type === 'Literal') {
    return ((imported as { value: unknown }).value as string) ?? ''
  }
  return ''
}

function getSourceValue(node: ESTree.Node): string {
  if (node.type === 'Literal') {
    const v = (node as { value: unknown }).value
    return typeof v === 'string' ? v : ''
  }
  return ''
}

export const importsRule: Rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce consistent imports from "solid-js", "solid-js/web", and "solid-js/store".',
      url: 'https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/imports.md',
    },
    fixable: 'code',
    schema: [],
    messages: {
      'prefer-source': 'Prefer importing {{name}} from "{{source}}".',
    },
  },
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        const source = getSourceValue(node.source)
        if (!isSource(source)) return

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const importSpec = specifier as ESTree.ImportSpecifier
            const isType =
              (importSpec as { importKind?: string }).importKind === 'type' ||
              (node as { importKind?: string }).importKind === 'type'
            const map = isType ? typeMap : primitiveMap
            const name = getImportedName(importSpec)
            const correctSource = map.get(name)
            if (correctSource != null && correctSource !== source) {
              context.report({
                node: importSpec,
                messageId: 'prefer-source',
                data: { name, source: correctSource },
                fix(fixer) {
                  const sourceCode = context.sourceCode
                  const program = sourceCode.ast as ESTree.Program
                  const correctDeclaration = program.body.find(
                    (n) =>
                      n.type === 'ImportDeclaration' &&
                      getSourceValue((n as ESTree.ImportDeclaration).source) === correctSource,
                  ) as ESTree.ImportDeclaration | undefined

                  const specifierText = sourceCode.getText(importSpec)
                  const fixes: Fix[] = [removeSpecifier(fixer, sourceCode, importSpec)]

                  if (correctDeclaration) {
                    const append = appendImports(fixer, sourceCode, correctDeclaration, [
                      specifierText,
                    ])
                    if (append) fixes.push(append)
                  } else {
                    const firstSolidDeclaration = program.body.find(
                      (n) =>
                        n.type === 'ImportDeclaration' &&
                        isSource(getSourceValue((n as ESTree.ImportDeclaration).source)),
                    ) as ESTree.ImportDeclaration | undefined
                    fixes.push(
                      insertImports(
                        fixer,
                        sourceCode,
                        correctSource,
                        [specifierText],
                        firstSolidDeclaration,
                        isType,
                      ),
                    )
                  }
                  return fixes
                },
              })
            }
          }
        }
      },
    }
  },
}
