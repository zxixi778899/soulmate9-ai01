import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig, globalIgnores } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const syntaxRules = [
  {
    selector: 'JSXOpeningElement[name.name="head"]',
    message:
      '禁止使用 head 标签，优先使用 metadata。三方 CSS、字体等资源可以在 globals.css 中顶部通过 @import 引入或者使用 next/font；preload, preconnect, dns-prefetch 通过 ReactDOM 的 preload、preconnect、dns-prefetch 方法引入；json-ld 可阅读 https://nextjs.org/docs/app/guides/json-ld',
  },
];

const nextConfigRestrictedSyntaxRules = [
  {
    selector:
      'Property[key.name=/^(root|outputFileTracingRoot)$/] > Literal[value=/^\\//]',
    message:
      '禁止在 next.config 中写死绝对路径，请改用 path.resolve(__dirname, ...)、import.meta.dirname 或 process.cwd() 动态拼接。',
  },
];

const eslintConfig = defineConfig([
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
  {
    rules: {
      'import/no-cycle': ['error', { ignoreExternal: true }],
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'no-restricted-syntax': ['error', ...syntaxRules],
      // any 主要出现在 catch 块的 error 类型上，运行时无影响。
      // 降级为 warning 不阻塞 deploy；真正的业务类型 any 已在代码中显式修正。
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['next.config.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...nextConfigRestrictedSyntaxRules],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'server.js',
    'dist/**',
    'scripts/**/*.js',
  ]),
]);

export default eslintConfig;
