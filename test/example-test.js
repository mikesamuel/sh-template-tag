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

const { expect } = require('chai')
const { describe, it } = require('mocha')
const { sh } = require('../index')

describe('example code', () => {
  describe('README.md', () => {
    // This mirrors example code in ../README.md so if you modify this,
    // be sure to reflect changes there.
    it('echo', () => {
      function echoCommand (a, b, c) {
        return sh`echo -- ${a} "${b}" 'c: ${c}'`
      }

      const result = echoCommand(
        '; rm -rf / #',
        '$(cat /etc/shadow)',
        '\'"$(cat /etc/shadow)"\n#')

      expect(result.content).to.equal(
        'echo -- \'; rm -rf / #\' "\\$(cat /etc/shadow)"' +
        ' \'c: \'"\'"\'"$(cat /etc/shadow)"\n#\'')
    })
  })
})
