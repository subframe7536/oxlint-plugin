import { RuleTester } from 'oxlint/plugins-dev'

import { methodSignatureStyleRule as rule } from './method-signature-style.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: {
      lang: 'tsx',
    },
  },
})
const validCases: RuleTester.ValidTestCase[] = [
  {
    code: `
interface Foo {
  bar: () => void;
}
          `,
    options: ['property'],
  },
  {
    code: `
interface Foo {
  bar(): void;
}
          `,
    options: ['method'],
  },
]

const invalidCases: RuleTester.InvalidTestCase[] = [
  {
    code: `
interface Foo {
  bar(): void;
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
interface Foo {
  bar: () => void;
}
`,
  },
  {
    code: `
interface Dog {
  barkAt(dog: Dog): void;
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
interface Dog {
  barkAt: (dog: Dog) => void;
}
`,
  },
  {
    code: `
type Handler = {
  handle(event: Event): Promise<void>;
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
type Handler = {
  handle: (event: Event) => Promise<void>;
}
`,
  },
  {
    code: `
interface API {
  fetch(url: string): Promise<Response>;
  fetch(url: string, opts: RequestInit): Promise<Response>;
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }, { messageId: 'errorMethod' }],
    output: `
interface API {
  fetch: ((url: string) => Promise<Response>) & ((url: string, opts: RequestInit) => Promise<Response>);
}
`,
  },
  {
    code: `
interface EdgeCases {
  optional?(): void
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
interface EdgeCases {
  optional?: () => void
}
`,
  },
  {
    code: `
interface EdgeCases {
  generic<T>(x: T): T
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
interface EdgeCases {
  generic: <T>(x: T) => T
}
`,
  },
  {
    code: `
interface EdgeCases {
  next(this: object): object
}
          `,
    options: ['property'],
    errors: [{ messageId: 'errorMethod' }],
    output: `
interface EdgeCases {
  next: (this: object) => object
}
`,
  },
]

ruleTester.run('method-signature-style', rule, {
  valid: validCases,
  invalid: invalidCases,
})
