import type { Plugin } from '@oxlint/plugins'

import { methodSignatureStyleRule } from './rules/method-signature-style.ts'
import { noNegatedConjunctionRule, noNegatedDisjunctionRule } from './rules/de-morgan.ts'
import { topLevelFunctionRule } from './rules/top-level-function.ts'
import { actionYieldAfterAwaitRule } from './rules/solid/action-yield-after-await.ts'
import { componentsReturnOnceRule } from './rules/solid/components-return-once.ts'
import { eventHandlersRule } from './rules/solid/event-handlers.ts'
import { importsRule } from './rules/solid/imports.ts'
import { jsxNoDuplicatePropsRule } from './rules/solid/jsx-no-duplicate-props.ts'
import { jsxNoScriptUrlRule } from './rules/solid/jsx-no-script-url.ts'
import { jsxNoUndefRule } from './rules/solid/jsx-no-undef.ts'
import { jsxUsesVarsRule } from './rules/solid/jsx-uses-vars.ts'
import { noAccessorAsPropRule } from './rules/solid/no-accessor-as-prop.ts'
import { noBooleanEnumeratedAttributeRule } from './rules/solid/no-boolean-enumerated-attribute.ts'
import { noBrowserGlobalsInServerFunctionRule } from './rules/solid/no-browser-globals-in-server-function.ts'
import { noDestructureRule } from './rules/solid/no-destructure.ts'
import { noInnerHTMLRule } from './rules/solid/no-innerhtml.ts'
import { noInvalidServerCaptureRule } from './rules/solid/no-invalid-server-capture.ts'
import { noModuleScopeReactivePrimitiveRule } from './rules/solid/no-module-scope-reactive-primitive.ts'
import { noReactSpecificPropsRule } from './rules/solid/no-react-specific-props.ts'
import { noRestatedDefaultOptionsRule } from './rules/solid/no-restated-default-options.ts'
import { noSingleArgCreateEffectRule } from './rules/solid/no-single-arg-create-effect.ts'
import { noStoreMutationOutsideSetterRule } from './rules/solid/no-store-mutation-outside-setter.ts'
import { noUnassignedVarsRule } from './rules/solid/no-unassigned-vars.ts'
import { noUnknownNamespacesRule } from './rules/solid/no-unknown-namespaces.ts'
import { noUnusedSignalRule } from './rules/solid/no-unused-signal.ts'
import { noWriteInPureComputationRule } from './rules/solid/no-write-in-pure-computation.ts'
import { preferForRule } from './rules/solid/prefer-for.ts'
import { preferOnSettledForSideEffectsRule } from './rules/solid/prefer-onSettled-for-side-effects.ts'
import { preferShowRule } from './rules/solid/prefer-show.ts'
import { preferStructuredClassRule } from './rules/solid/prefer-structured-class.ts'
import { reactivityRule } from './rules/solid/reactivity.ts'
import { removedApiRule } from './rules/solid/removed-api.ts'
import { requireAsyncServerFunctionRule } from './rules/solid/require-async-server-function.ts'
import { selfClosingCompRule } from './rules/solid/self-closing-comp.ts'
import { validUseServerRule } from './rules/solid/valid-use-server.ts'
import { validateJsxNestingRule } from './rules/solid/validate-jsx-nesting.ts'

const plugin: Plugin = {
  meta: {
    name: 'subf',
  },
  rules: {
    'method-signature-style': methodSignatureStyleRule,
    'no-negated-conjunction': noNegatedConjunctionRule,
    'no-negated-disjunction': noNegatedDisjunctionRule,
    'top-level-function': topLevelFunctionRule,
    'solid-action-yield-after-await': actionYieldAfterAwaitRule,
    'solid-components-return-once': componentsReturnOnceRule,
    'solid-event-handlers': eventHandlersRule,
    'solid-imports': importsRule,
    'solid-jsx-no-duplicate-props': jsxNoDuplicatePropsRule,
    'solid-jsx-no-script-url': jsxNoScriptUrlRule,
    'solid-jsx-no-undef': jsxNoUndefRule,
    'solid-jsx-uses-vars': jsxUsesVarsRule,
    'solid-no-accessor-as-prop': noAccessorAsPropRule,
    'solid-no-boolean-enumerated-attribute': noBooleanEnumeratedAttributeRule,
    'solid-no-browser-globals-in-server-function': noBrowserGlobalsInServerFunctionRule,
    'solid-no-destructure': noDestructureRule,
    'solid-no-innerhtml': noInnerHTMLRule,
    'solid-no-invalid-server-capture': noInvalidServerCaptureRule,
    'solid-no-module-scope-reactive-primitive': noModuleScopeReactivePrimitiveRule,
    'solid-no-react-specific-props': noReactSpecificPropsRule,
    'solid-no-restated-default-options': noRestatedDefaultOptionsRule,
    'solid-no-single-arg-create-effect': noSingleArgCreateEffectRule,
    'solid-no-store-mutation-outside-setter': noStoreMutationOutsideSetterRule,
    'solid-no-unassigned-vars': noUnassignedVarsRule,
    'solid-no-unknown-namespaces': noUnknownNamespacesRule,
    'solid-no-unused-signal': noUnusedSignalRule,
    'solid-no-write-in-pure-computation': noWriteInPureComputationRule,
    'solid-prefer-for': preferForRule,
    'solid-prefer-onSettled-for-side-effects': preferOnSettledForSideEffectsRule,
    'solid-prefer-show': preferShowRule,
    'solid-prefer-structured-class': preferStructuredClassRule,
    'solid-reactivity': reactivityRule,
    'solid-removed-api': removedApiRule,
    'solid-require-async-server-function': requireAsyncServerFunctionRule,
    'solid-self-closing-comp': selfClosingCompRule,
    'solid-valid-use-server': validUseServerRule,
    'solid-validate-jsx-nesting': validateJsxNestingRule,
  },
}

export default plugin
