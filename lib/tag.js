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

require('module-keys/cjs').polyfill(module, require)

const crypto = require('crypto')
const {
  memoizedTagFunction,
  trimCommonWhitespaceFromLines
} = require('template-tag-common')
const { Mintable } = require('node-sec-patterns')
const { ShFragment } = require('./fragment')
const {
  embedderForContext,
  fail,
  heredocBodyRegExp,
  heredocLabel,
  makeLexer
} = require('./lexer')

/**
 * A string wrapper that marks its content as a series of
 * well-formed SQL tokens.
 */
const mintShFragment = require.moduleKeys.unbox(
  Mintable.minterFor(ShFragment), null, (x) => String(x))

/** Applies the lexer to the static parts. */
function computeShellContexts (staticStrings) {
  // Collect an array of parsing decisions so that
  // we don't need to rerun the lexer when a particalar tag use
  // is executed multiple times.
  const contexts = []
  const { raw } = trimCommonWhitespaceFromLines(staticStrings)

  const lexer = makeLexer()
  for (let i = 0, len = raw.length; i < len; ++i) {
    const chunk = raw[i]
    contexts.push(lexer(chunk))
  }

  // Require valid end state.
  lexer(null)

  return { contexts, raw }
}

/**
 * Composes an ShFragment whose content consists of staticStrings
 * interleaved with untrusted appropriately escaped.
 */
function composeShellString (
  options, { contexts, raw: trusted }, strings, untrusted) {
  // A buffer onto which we accumulate output.
  const buf = [ trusted[0] ]
  let [ currentContext ] = contexts
  for (let i = 0, len = untrusted.length; i < len; ++i) {
    const newContext = contexts[i + 1]
    const value = untrusted[i]
    let [ delim ] = currentContext
    if (delim[0] === '<') {
      delim = '<<'
    }
    const embedder = embedderForContext(delim)
    const chunk = trusted[i + 1]
    buf.push(embedder(value, buf, currentContext), chunk)
    if (currentContext !== newContext &&
        delim[0] === '<' && delim[1] === '<') {
      fixupHeredoc(buf, currentContext, newContext)
    }
    currentContext = newContext
  }

  return mintShFragment(buf.join(''))
}

/**
 * Double checks that dynamic content interpolated into a heredoc
 * string does not include the end word.
 * <p>
 * If it does, rewrites content on the buffer to use non-conflicting
 * start and end words.
 * <p>
 * If this functions fails to avoid a collision, it will fail with an
 * exception, but this should not reliably occur unless an attacker
 * can generate hash collisions.
 */
function fixupHeredoc (buf, heredocContext) {
  const [ delim, contextStart, contextOffset, delimLength ] = heredocContext
  let chunkLeft = 0
  let startChunkIndex = -1
  for (let i = 0, len = buf.length; i < len; ++i) {
    chunkLeft += buf[i].length
    if (chunkLeft >= contextStart) {
      startChunkIndex = i
      break
    }
  }
  if (startChunkIndex < 0) {
    throw fail`Cannot find heredoc start for ${heredocContext}`
  }
  const label = heredocLabel(delim)
  const endChunkIndex = buf.length - 1

  // Figure out how much of the last chunk is part of the body.
  const bodyRe = heredocBodyRegExp(label)
  const endChunk = buf[endChunkIndex]
  const lastBodyMatch = bodyRe.exec(endChunk)
  if (lastBodyMatch[0].length === endChunk.length) {
    throw fail`Could not find end of ${delim}`
  }

  const startChunk = buf[startChunkIndex]
  let body = startChunk.substring(contextOffset + delimLength)
  for (let i = startChunkIndex + 1; i < endChunkIndex; ++i) {
    body += buf[i]
  }
  body += lastBodyMatch[0]

  // Look for a premature end delimiter by looking at newline followed by body.
  const testBody = `\n${body}`
  if (bodyRe.exec(testBody)[0].length !== testBody.length) {
    // There is an embedded delimiter.
    // Choose a suffix that an attacker cannot predict.
    // An attacker would need to be able to generate sha256
    // collisions to embed both NL <label> and NL <label> <suffix>.
    let suffix = '_'
    suffix += crypto.createHash('sha256')
      .update(body, 'utf8')
      .digest('base64')
      .replace(/[=]+$/, '')
    const newLabel = label + suffix
    const newBodyRe = heredocBodyRegExp(newLabel)
    if (!newBodyRe.exec(testBody)[0].length === testBody.length) {
      throw fail`Cannot solve embedding hazard in ${body} in heredoc with ${label} due to hash collision`
    }

    const endDelimEndOffset = lastBodyMatch[0].length +
        endChunk.substring(lastBodyMatch[0].length)
          // If the \w+ part below changes, also change the \w+ in the lexer
          // after the check for << and <<- start delimiters.
          .match(/[\r\n]\w+/)[0].length
    const before = startChunk.substring(0, contextOffset + delimLength)
      .replace(/[\r\n]+$/, '')
    const after = startChunk.substring(contextOffset + delimLength)
    buf[startChunkIndex] = `${before}${suffix}\n${after}`
    buf[endChunkIndex] = (
      endChunk.substring(0, endDelimEndOffset) +
        suffix +
        endChunk.substring(endDelimEndOffset))
  }
}

const shTagFunction = memoizedTagFunction(
  computeShellContexts,
  composeShellString)

exports.sh = shTagFunction
exports.bash = shTagFunction
exports.ShFragment = ShFragment
