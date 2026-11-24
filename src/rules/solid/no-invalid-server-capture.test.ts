import { RuleTester } from 'oxlint/plugins-dev'
import { noInvalidServerCaptureRule as rule } from './no-invalid-server-capture.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-invalid-server-capture', rule, {
  valid: [
    {
      code: `
const TOP = 42;
function Comp() {
  const save = async (id: string) => {
    "use server";
    return TOP + id;
  };
  return save;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
function Comp(props: { id: string }) {
  const local = 1;
  const save = async () => {
    "use server";
    return local;
  };
  return save;
}
      `,
      errors: [{ messageId: 'invalidCapture' }],
    },
  ],
})
