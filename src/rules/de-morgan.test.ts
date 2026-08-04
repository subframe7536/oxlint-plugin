import { RuleTester } from 'oxlint/plugins-dev'

import { noNegatedConjunctionRule, noNegatedDisjunctionRule } from './de-morgan.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('no-negated-conjunction', noNegatedConjunctionRule, {
  valid: [
    { code: 'if (!value) {}' },
    { code: 'if (value && other) {}' },
    { code: 'if (!(value || other)) {}' },
    { code: 'if (!(value && other || third)) {}' },
    { code: 'if (!!(value && other)) {}' },
    { code: 'consume(!(value && !other))' },
  ],
  invalid: [
    {
      code: 'if (!(value && other)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!value || !other) {}',
    },
    {
      code: 'if (!(value && other && third)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!value || !other || !third) {}',
    },
    {
      code: 'if (!(value && (other || third))) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!value || !(other || third)) {}',
    },
    {
      code: 'if (!(value && !other)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!value || other) {}',
    },
    {
      code: 'if (!(value === other && third !== fourth)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (value !== other || third === fourth) {}',
    },
    {
      code: 'if (!(value < other && third)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!(value < other) || !third) {}',
    },
    {
      code: 'if (!(true && false)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (false || true) {}',
    },
    {
      code: 'if (!(value && // keep this comment\n  other)) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'if (!value || // keep this comment\n  !other) {}',
    },
    {
      code: 'const result = value ?? !(other && third)',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'const result = value ?? (!other || !third)',
    },
    {
      code: 'const result = !(value && other) === third',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'const result = (!value || !other) === third',
    },
    {
      code: 'for (const result = !(value && other); result; ) {}',
      errors: [{ messageId: 'convertNegatedConjunction' }],
      output: 'for (const result = (!value || !other); result; ) {}',
    },
    {
      code: 'result = value\n!(other && third) === fallback',
      errors: [{ messageId: 'convertNegatedConjunction' }],
    },
  ],
})

ruleTester.run('no-negated-disjunction', noNegatedDisjunctionRule, {
  valid: [
    { code: 'if (!value) {}' },
    { code: 'if (value || other) {}' },
    { code: 'if (!(value && other)) {}' },
    { code: 'if (!(value || other && third)) {}' },
    { code: 'consume(!(value || !other))' },
  ],
  invalid: [
    {
      code: 'if (!(value || other)) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (!value && !other) {}',
    },
    {
      code: 'if (!(value || other || third)) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (!value && !other && !third) {}',
    },
    {
      code: 'if (!(value || (other && third))) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (!value && !(other && third)) {}',
    },
    {
      code: 'if (!(value || !other)) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (!value && other) {}',
    },
    {
      code: 'if (!(value == other || third != fourth)) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (value != other && third == fourth) {}',
    },
    {
      code: 'if (!(value instanceof Other || third)) {}',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'if (!(value instanceof Other) && !third) {}',
    },
    {
      code: 'const result = value ?? !(other || third)',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
      output: 'const result = value ?? (!other && !third)',
    },
    {
      code: 'result = value\n!(other || third) === fallback',
      errors: [{ messageId: 'convertNegatedDisjunction' }],
    },
  ],
})
