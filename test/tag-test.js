/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint "id-length": off */

require('module-keys/cjs').polyfill(module, require)

const { expect } = require('chai')
const { describe, it } = require('mocha')
const { sh, ShFragment } = require('../index')
const { Mintable } = require('node-sec-patterns')

// Unwrap an ShFragment, failing if the result is not one.
function unwrap (x) {
  if (x instanceof ShFragment) {
    return String(x)
  }
  throw new Error(`Expected ShFragment not ${JSON.stringify(x)}`)
}

// Run a test multiply  to exercise the memoizing code.
function runShTest (golden, test) {
  for (let i = 3; --i >= 0;) {
    if (golden === '_ERR_') {
      expect(test).to.throw()
    } else {
      expect(unwrap(test())).to.equal(golden)
    }
  }
}

describe('sh template tags', () => {
  const mintShFragment = require.moduleKeys.unboxStrict(
    Mintable.minterFor(ShFragment))

  const str = 'a"\'\n\\$b'
  const numb = 1234
  const frag = mintShFragment(' frag ')
  describe('template tag', () => {
    it('string in top level', () => {
      runShTest(`echo 'a"'"'"'\n\\$b'`, () => sh`echo ${str}`)
    })
    it('number in top level', () => {
      runShTest(`echo '1234'`, () => sh`echo ${numb}`)
    })
    it('fragment in top level', () => {
      runShTest(`echo  frag `, () => sh`echo ${frag}`)
    })
    it('string in dq', () => {
      runShTest(`echo "a\\"'\n\\\\\\$b"`, () => sh`echo "${str}"`)
    })
    it('number in dq', () => {
      runShTest(`echo "1234"`, () => sh`echo "${numb}"`)
    })
    it('fragment in dq', () => {
      runShTest(`echo " frag "`, () => sh`echo "${frag}"`)
    })
    it('string in sq', () => {
      runShTest(`echo 'a"'"'"'\n\\$b'`, () => sh`echo '${str}'`)
    })
    it('number in sq', () => {
      runShTest(`echo '1234'`, () => sh`echo '${numb}'`)
    })
    it('fragment in sq', () => {
      runShTest(`echo ' frag '`, () => sh`echo '${frag}'`)
    })
    it('string in embed', () => {
      runShTest(
        `echo $(echo 'a"'"'"'\n\\$b')`,
        () => sh`echo $(echo ${str})`)
    })
    it('number in embed', () => {
      runShTest(
        `echo $(echo '1234')`,
        () => sh`echo $(echo ${numb})`)
    })
    it('fragment in embed', () => {
      runShTest(
        `echo $(echo  frag )`,
        () => sh`echo $(echo ${frag})`)
    })
    it('hash ambig string', () => {
      runShTest(`_ERR_`, () => sh`echo foo${str}#bar`)
    })
    it('hash ambig fragment', () => {
      runShTest(`_ERR_`, () => sh`echo foo${frag}#bar`)
    })
    it('heredoc string', () => {
      runShTest(
        '\ncat <<EOF\na"\'\n\\$b\nEOF\n',
        () => sh`
cat <<EOF
${str}
EOF
`)
    })
    it('heredoc number', () => {
      runShTest(
        '\ncat <<EOF\n1234\nEOF\n',
        () => sh`
cat <<EOF
${numb}
EOF
`)
    })
    it('heredoc fragment', () => {
      runShTest(
        '\ncat <<EOF\n frag \nEOF\n',
        () => sh`
cat <<EOF
${frag}
EOF
`)
    })
    it('heredoc sneaky', () => {
      runShTest(
        `
cat <<EOF_ZQHNfpzxDMLfdgCg8NUgxceUCSQiISNU1zQuqzI6uzs
EOF
rm -rf /
cat <<EOF
EOF_ZQHNfpzxDMLfdgCg8NUgxceUCSQiISNU1zQuqzI6uzs
`,

        () => sh`
cat <<EOF
${'EOF\nrm -rf /\ncat <<EOF'}
EOF
`)
    })
    it('null in strings', () => {
      runShTest(
        `echo "" ''`,
        () => sh`echo "${null}" '${null}'`)
    })
    it('comment bypasses', () => {
      const payload = '\ncat /etc/shadow #'
      runShTest(
        'echo \'\ncat /etc/shadow #\' #  \n',
        () => sh`echo ${payload} # ${payload}
`)
    })
  })
})
