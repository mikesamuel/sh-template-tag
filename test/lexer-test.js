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
const { makeLexer } = require('../lib/lexer.js')

/**
 * Feeds chunks to the lexer and concatenates contexts.
 * Tests that the lexer ends in a valid end state and
 * appends '_ERR_' as an end state if not.
 */
function tokens (...chunks) {
  const lexer = makeLexer()
  const out = []
  for (let i = 0, len = chunks.length; i < len; ++i) {
    out.push(lexer(chunks[i])[0] || '_')
  }
  try {
    lexer(null)
  } catch (exc) {
    out.push('_ERR_')
  }
  return out.join(',')
}

describe('lexer', () => {
  describe('tokens', () => {
    it('empty string', () => {
      expect(tokens('')).to.equal('_')
    })
    it('word', () => {
      expect(tokens('foo')).to.equal('_')
    })
    it('words', () => {
      expect(tokens('foo bar baz')).to.equal('_')
    })
    it('words split', () => {
      expect(tokens('foo bar', ' ', 'baz')).to.equal('_,_,_')
    })
    it('parens', () => {
      expect(tokens('foo (bar) baz')).to.equal('_')
    })
    it('parens split', () => {
      expect('_,_,(,_,_,_').to.equal(
        tokens('foo', ', ', '(bar', ')', ' ', 'baz'))
    })
    it('parens hanging split', () => {
      expect('_,_,(,(,(,_ERR_').to.equal(
        tokens('foo', ', ', '(bar', ' ', 'baz'))
    })
    it('quotes embed subshell', () => {
      expect('",$(,_').to.equal(
        tokens(' "foo', '$(bar ', ' baz)" boo'))
    })
    it('quotes embed arithshell', () => {
      expect('",$((,$((,",_').to.equal(
        tokens(' "foo', '$((bar ', '(far)', ' baz))', 'q" boo'))
    })
    it('quotes embed backticks', () => {
      expect('",`,`,",_').to.equal(
        tokens(' "foo', '`bar ', '(far)', ' baz`', 'q" boo'))
    })
    it('escape affects subshell', () => {
      expect('",",",",_').to.equal(
        tokens(' "foo', '\\$((bar ', '(far)', ' baz))', 'q" boo'))
    })
    it('single quotes do not embed', () => {
      expect(`',',',',_`).to.equal(
        tokens(
          ' \' $(',
          'foo) $((',
          'bar))',
          ' `',
          ' ` # \' '))
    })
    it('unterminated comment', () => {
      expect('#,_ERR_').to.equal(
        tokens(' #foo'))
    })
    it('terminated comment', () => {
      expect('_').to.equal(
        tokens(' #foo\n'))
    })
    it('terminated comment split', () => {
      expect('#,_').to.equal(
        tokens(' #foo', 'bar\n'))
    })
    it('arithshell', () => {
      expect('_,$((,$((,_,_').to.equal(
        tokens('foo', ' $((bar ', '(far)', ' baz))', ' boo'))
    })
    it('backticks', () => {
      expect('_,`,`,_,_').to.equal(
        tokens('foo', '`bar ', '(far)', ' baz`', ' boo'))
    })
    it('subshell paren disambiguation', () => {
      expect('$(,(,$(,",_,_').to.equal(tokens(
        'echo "$(foo ', ' | (bar ', ' baz)', ' boo)', 'far" | ', ''))
    })
    it('hash not after space', () => {
      expect('_,_').to.equal(
        tokens('echo foo#', ''))
    })
    it('hash after space', () => {
      expect('#,#,_ERR_').to.equal(
        tokens('echo foo #', ''))
    })
    it('hash concatenation hazard', () => {
      expect(() => tokens('#foo')).to.throw()
    })
    it('intermediate concatenation hazard', () => {
      expect(() => tokens('echo foo', '#bar')).to.throw()
    })
    it('escaped intermediate concatenation hazard', () => {
      expect('_,_').to.equal(tokens(
        'echo foo', '\\#bar'))
    })
    it('simple heredoc', () => {
      expect(tokens('cat <<EOF\nFoo bar\nEOF\n')).to.equal('_')
    })
    it('heredoc hazard', () => {
      // Concatenation hazard when no eol at end
      expect(tokens('cat <<EOF\nFoo bar\nEOF')).to.equal('<<EOF,_ERR_')
    })
    it('split heredoc', () => {
      expect(tokens('cat <<EOF\nFoo', ' bar\nEOF\n')).to.equal('<<EOF,_')
    })
    it('split heredoc sp', () => {
      expect(tokens('cat << EOF\nFoo', ' bar\nEOF\n')).to.equal('<<EOF,_')
    })
    it('split heredoc-', () => {
      expect(tokens('cat <<-EOF\nFoo', ' bar\nEOF\n')).to.equal('<<-EOF,_')
    })
    it('bad heredoc label', () => {
      expect(() => tokens('cat << "EOF"\nFoo bar\nEOF;')).to.throw()
    })
    it('missing heredoc label', () => {
      expect(() => tokens('cat <<', '\nfoo bar\n', ';')).to.throw()
    })
    it('escape at chunk end', () => {
      expect(() => tokens('echo "\\', '"')).to.throw()
    })
  })
})
