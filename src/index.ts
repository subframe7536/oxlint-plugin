import type { Plugin } from '@oxlint/plugins'

import { methodSignatureStyleRule } from './rules/method-signature-style.ts'
import { componentsReturnOnceRule } from './rules/solid/components-return-once.ts'
import { eventHandlersRule } from './rules/solid/event-handlers.ts'
import { importsRule } from './rules/solid/imports.ts'
import { jsxNoDuplicatePropsRule } from './rules/solid/jsx-no-duplicate-props.ts'
import { jsxNoScriptUrlRule } from './rules/solid/jsx-no-script-url.ts'
import { jsxNoUndefRule } from './rules/solid/jsx-no-undef.ts'
import { jsxUsesVarsRule } from './rules/solid/jsx-uses-vars.ts'
import { noDestructureRule } from './rules/solid/no-destructure.ts'
import { noInnerHTMLRule } from './rules/solid/no-innerhtml.ts'
import { preferForRule } from './rules/solid/prefer-for.ts'
import { preferShowRule } from './rules/solid/prefer-show.ts'
import { reactivityRule } from './rules/solid/reactivity.ts'
import { selfClosingCompRule } from './rules/solid/self-closing-comp.ts'

const plugin: Plugin = {
  meta: {
    name: 'subf',
  },
  rules: {
    'method-signature-style': methodSignatureStyleRule,
    'solid-components-return-once': componentsReturnOnceRule,
    'solid-event-handlers': eventHandlersRule,
    'solid-imports': importsRule,
    'solid-jsx-no-duplicate-props': jsxNoDuplicatePropsRule,
    'solid-jsx-no-script-url': jsxNoScriptUrlRule,
    'solid-jsx-no-undef': jsxNoUndefRule,
    'solid-jsx-uses-vars': jsxUsesVarsRule,
    'solid-no-destructure': noDestructureRule,
    'solid-no-innerhtml': noInnerHTMLRule,
    'solid-prefer-for': preferForRule,
    'solid-prefer-show': preferShowRule,
    'solid-reactivity': reactivityRule,
    'solid-self-closing-comp': selfClosingCompRule,
  },
}

export default plugin
