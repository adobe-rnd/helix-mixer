/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import globals from 'globals';
import { defineConfig, globalIgnores } from '@eslint/config-helpers';
import { recommended, source, test } from '@adobe/eslint-config-helix';

export default defineConfig([
  globalIgnores([
    '.nyc_output/',
    '.wrangler/',
    'bin/dist/',
    'coverage/*',
    'dist/',
  ]),
  {
    extends: [recommended],
    plugins: {
      import: recommended.plugins.import,
    },
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        // e.g. for crypto
        ...globals.browser,
      },
    },
    rules: {
      // v2 (via airbnb-base) used curly: 'multi-line'; v3 tightened it to 'all'.
      // Keep the long-standing style: the 'all' fixer emits a single-line block
      // that then fails max-statements-per-line, which has no fixer.
      curly: ['error', 'multi-line'],

      'import/prefer-default-export': 0,

      // console.log is the only means of logging in a cloudflare worker
      'no-console': 'off',

      // We have quite a lot of use cases where assignment to function
      // parameters is definitely desirable
      'no-param-reassign': 'off',

      'import/no-extraneous-dependencies': ['error', {
        devDependencies: true,
      }],
    },
  },
  source,
  {
    ...test,
    rules: {
      'import/no-extraneous-dependencies': ['error', {
        devDependencies: true,
        optionalDependencies: false,
        peerDependencies: false,
      }],
    },
  },
]);
