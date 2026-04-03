import type { Plugin } from '@oxlint/plugins'

import { methodSignatureStyleRule } from './rules/method-signature-style'

const plugin: Plugin = {
  meta: {
    name: 'subf',
  },
  rules: {
    'method-signature-style': methodSignatureStyleRule,
  },
}

export default plugin
