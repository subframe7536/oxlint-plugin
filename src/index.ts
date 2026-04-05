import type { Plugin } from '@oxlint/plugins'

import { methodSignatureStyleRule } from './rules/method-signature-style'
import { componentsReturnOnceRule } from './rules/solid/components-return-once'
import { eventHandlersRule } from './rules/solid/event-handlers'
import { importsRule } from './rules/solid/imports'
import { jsxNoDuplicatePropsRule } from './rules/solid/jsx-no-duplicate-props'
import { jsxNoScriptUrlRule } from './rules/solid/jsx-no-script-url'
import { jsxNoUndefRule } from './rules/solid/jsx-no-undef'
import { jsxUsesVarsRule } from './rules/solid/jsx-uses-vars'
import { noDestructureRule } from './rules/solid/no-destructure'
import { noInnerHTMLRule } from './rules/solid/no-innerhtml'
import { preferForRule } from './rules/solid/prefer-for'
import { preferShowRule } from './rules/solid/prefer-show'
import { reactivityRule } from './rules/solid/reactivity'
import { selfClosingCompRule } from './rules/solid/self-closing-comp'

const plugin: Plugin = {
  meta: {
    name: 'subf',
  },
  rules: {
    'method-signature-style': methodSignatureStyleRule,
    'solid/components-return-once': componentsReturnOnceRule,
    'solid/event-handlers': eventHandlersRule,
    'solid/imports': importsRule,
    'solid/jsx-no-duplicate-props': jsxNoDuplicatePropsRule,
    'solid/jsx-no-script-url': jsxNoScriptUrlRule,
    'solid/jsx-no-undef': jsxNoUndefRule,
    'solid/jsx-uses-vars': jsxUsesVarsRule,
    'solid/no-destructure': noDestructureRule,
    'solid/no-innerhtml': noInnerHTMLRule,
    'solid/prefer-for': preferForRule,
    'solid/prefer-show': preferShowRule,
    'solid/reactivity': reactivityRule,
    'solid/self-closing-comp': selfClosingCompRule,
  },
}

export default plugin
