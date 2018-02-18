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

/**
 * @fileoverview
 * A lexer for sh/bash style shell scripts.
 */

const { isShFragment } = require('./fragment')

/** A regex chunk that matches only s. */
function reEsc (str) {
  return str.replace(/[\^\x5b\x5d\-\\]/g, '\\$&')
    .replace(/[*+(){}|$/.]/g, '[$&]')
}

/** The union of the given regex chunks. */
function reUnion (alternatives) {
  return `(?:${alternatives.join('|')})`
}

const ALL_DELIMS = [ '"', '\'', '#', '`', '$((', '$(', '${', '(', '<<-', '<<' ]
const NLS = [ '\n', '\r\n', '\r' ]

// Embedders take the value to embed and return the text to substitute. */
/** Embeds a value where a single quoted string token is allowed. */
function emsq (x) {
  if (isShFragment(x)) {
    return x.content
  }
  return `'${emisq(x)}'`
}
/** Embeds a string in an opened single quoted string */
function emisq (x) {
  if (x == null) { // eslint-disable-line no-eq-null
    // Intentionally matches undefined
    return ''
  }
  return String(x).replace(/'/g, `'"'"'`)
}
/** Embeds a string in an opened double quoted string */
function emidq (x) {
  if (x == null) { // eslint-disable-line no-eq-null
    // Intentionally matches undefined
    return ''
  }
  return String(x).replace(/[$"\\]/g, '\\$&')
}
/** Embeds in a comment, replacing the content with a space */
function emsp (x) {
  return ' '
}
/**
 * Embeds in heredoc.
 * We handle rewriting HEREDOC labels to avoid collisions later.
 */
function emhd (x) {
  return String(x)
}

/**
 * Maps start delimiters to their end delimiters and whether
 * '\\' and start delimiters are significant.
 *
 * Properties:
 * .ends: delimiters that end blocks that start with the key.
 * .embed: a function that converts values to content that embeds within
 *         the block.
 * .escapes: true iff backslash escapes a character that might otherwise
 *         participate in a start or end delimiter, or another backslash.
 * .nests: list of start delimiters that are significant in the block.
 *
 * Extra properties derived from above:
 * .bodyRegExp: matches a prefix of a string that is a chunk of body content.
 * .startRegExp: matches a start delimiter in nests at start of input
 * .endRegExp: matches an end delimiter at start of input.
 */
const DELIMS = {
  '': { ends: [], embed: emsq, escapes: false, nests: ALL_DELIMS },
  '"': { ends: [ '"' ], embed: emidq, escapes: true, nests: [ '`', '$((', '$(', '${' ] },
  '\'': { ends: [ '\'' ], embed: emisq, escapes: false, nests: [] },
  '`': { ends: [ '`' ], embed: emsq, escapes: true, nests: ALL_DELIMS },
  '$((': { ends: [ '))' ], embed: emsq, escapes: true, nests: ALL_DELIMS },
  '$(': { ends: [ ')' ], embed: emsq, escapes: true, nests: ALL_DELIMS },
  '${': { ends: [ '}' ], embed: emsq, escapes: true, nests: ALL_DELIMS },
  '(': { ends: [ ')' ], embed: emsq, escapes: true, nests: ALL_DELIMS },
  // '#' requires special handling below since it must follow whitespace
  '#': { ends: NLS, embed: emsp, escapes: false, nests: [] },
  // Heredoc requires special handling below to handle the nonce.
  '<<': { ends: NLS, embed: emhd, escapes: false, nests: [] },
  '<<-': { ends: NLS, embed: emhd, escapes: false, nests: [] }
}

// Flesh out the DELIMS table with derived information used by the lexer.
do {
  ((() => {
    for (const startDelim in DELIMS) {
      const delimInfo = DELIMS[startDelim]
      const { nests, ends, escapes } = delimInfo

      const startsPattern = nests.length ? reUnion(nests.map(reEsc)) : '(?!)'
      const endsPattern = ends.length ? reUnion(ends.map(reEsc)) : '(?!)'
      // Any number of (see Kleene-* below)
      let pattern = '^(?:'
      if (escapes) {
        // Any escaped character or ...
        pattern += '[\\\\][\\s\\S]|'
      }

      // Not one of ends
      pattern += `(?!${endsPattern}`
      if (nests.length) {
        pattern += `|${startsPattern}`
      }
      pattern += ')'

      // Character to match.
      pattern += escapes ? '[^\\\\]' : '[\\s\\S]'
      pattern += ')*'
      delimInfo.bodyRegExp = new RegExp(pattern)
      delimInfo.endRegExp = new RegExp(`^${endsPattern}`)
      delimInfo.startRegExp = new RegExp(`^${startsPattern}`)
    }
  })())
} while (0)

/** Template tag that creates a new Error with a message. */
function fail (strs, ...dyn) {
  let [ msg ] = strs
  for (let i = 0; i < dyn.length; ++i) {
    msg += JSON.stringify(dyn[i]) + strs[i + 1]
  }
  return new Error(msg)
}

function embedderForContext (delim) {
  return DELIMS[delim].embed
}

const HASH_COMMENT_PRECEDER = /[\t\n\r (]$/

/** Skip over "<<" or "<<-" prefix to get the label. */
function heredocLabel (startDelim) {
  return startDelim.substring(2 + (startDelim[2] === '-'))
}

function heredocBodyRegExp (label) {
  return new RegExp(
    // Maximal run of non-CRLF characters or a CRLF character
    // that is not followed by the label and a newline after
    // a run of spaces or tabs.
    `^(?:[^\n\r]|(?![\n\r]${label}[\r\n])[\n\r])*`)
}

const START_CONTEXT = Object.freeze([ '', 0, 0, 0 ])

/**
 * Returns a function that can be fed chunks of input and
 * which returns the context in which interpolation occurs.
 * If the returned function is fed null, then it will
 * throw an error only if not in a valid end context.
 */
function makeLexer () {
  // A stack of (
  //     start delimiter,
  //     position of start in concatenation of chunks,
  //     position of start in current chunk)
  //     delimiter length in chunk
  // for each start delimiter for which we have not yet seen
  // an end delimiter.
  const delimiterStack = [ START_CONTEXT ]
  let position = 0

  function propagateContextOverChunk (origChunk) {
    // A suffix of origChunk that we consume as we tokenize.
    let chunk = origChunk
    while (chunk) {
      const top = delimiterStack[delimiterStack.length - 1]
      const [ topStartDelim ] = top
      let delimInfo = DELIMS[topStartDelim]
      let bodyRegExp = null
      if (delimInfo) {
        bodyRegExp = delimInfo.bodyRegExp // eslint-disable-line prefer-destructuring
      } else if (topStartDelim[0] === '<' && topStartDelim[1] === '<') {
        bodyRegExp = heredocBodyRegExp(heredocLabel(topStartDelim))
        delimInfo = DELIMS['<<']
      } else {
        throw fail`Failed to maximally match chunk ${chunk}`
      }
      const match = bodyRegExp.exec(chunk)
      // Our bodies always have a kleene-* so match will never be empty.
      const nCharsMatched = match[0].length
      chunk = chunk.substring(nCharsMatched)
      position += nCharsMatched

      if (!chunk) {
        // All done.  Yay!
        break
      }

      const afterDelimitedRegion = findDelimitedRegionInChunk(
        delimInfo, origChunk, chunk)
      if (afterDelimitedRegion.length >= chunk.length) {
        throw fail`Non-body content remaining ${chunk} that has no delimiter in context ${top}`
      }
      chunk = afterDelimitedRegion
    }
  }

  /**
   * Look for a matching end delimiter, or, if that fails,
   * apply nesting rules to figure out which kind of start delimiters
   * we might look for.
   *
   * @param delimInfo relating to the topmost delimiter on the stack
   * @param origChunk the entire chunk being lexed
   * @param chunk the suffix of origChunk starting with the delimiter start
   *
   * @return the suffix of chunk after processing any delimiter
   */
  function findDelimitedRegionInChunk (delimInfo, origChunk, chunk) {
    let match = delimInfo.endRegExp.exec(chunk)
    if (match) {
      if (delimiterStack.length === 1) {
        // Should never occur since DELIMS[''] does not have
        // any end delimiters.
        throw fail`Popped past end of stack`
      }
      --delimiterStack.length
      position += match[0].length
      return chunk.substring(match[0].length)
    } else if (delimInfo.nests.length) {
      match = delimInfo.startRegExp.exec(chunk)
      if (match) {
        return propagateContextOverDelimiter(origChunk, chunk, match)
      }
    }
    return chunk
  }

  /**
   * Does some delimiter specific parsing.
   *
   * @param origChunk the entire chunk being lexed
   * @param chunk the suffix of origChunk starting with the delimiter start
   * @param match the match of the delimiters startRegExp
   */
  function propagateContextOverDelimiter (origChunk, chunk, match) {
    let [ start ] = match
    let delimLength = start.length
    if (start === '#') {
      const chunkStartInWhole = origChunk.length - chunk.length
      if (chunkStartInWhole === 0) {
        // If we have a chunk that starts with a
        // '#' then we don't know whether two
        // ShFragments can be concatenated to
        // produce an unambiguous ShFragment.
        // Consider
        //    sh`foo ${x}#bar`
        // If x is a normal string, it will be
        // quoted, so # will be treated literally.
        // If x is a ShFragment that ends in a space
        // '#bar' would be treated as a comment.
        throw fail`'#' at start of ${chunk} is a concatenation hazard.  Maybe use \#`
      } else if (!HASH_COMMENT_PRECEDER.test(origChunk.substring(0, chunkStartInWhole))) {
        // A '#' is not after whitespace, so does
        // not start a comment.
        chunk = chunk.substring(1)
        position += 1
        return chunk
      }
    } else if (start === '<<' || start === '<<-') {
      // If the \w+ part below changes, also change the \w+ in fixupHeredoc.
      const fullDelim = /^<<-?[ \t]*(\w+)[ \t]*[\n\r]/.exec(chunk)
      // http://pubs.opengroup.org/onlinepubs/009695399/utilities/xcu_chap02.html#tag_02_03
      // defines word more broadly.
      // We can't handle that level of complexity here
      // so fail for all heredoc that do not match word.
      if (!fullDelim) {
        throw fail`Failed to find heredoc word at ${chunk}.  Just pick a label and sh will prevent collisions.`
      }
      start += fullDelim[1]
      delimLength = fullDelim[0].length
    }
    delimiterStack.push(Object.freeze(
      [ start, position, origChunk.length - chunk.length, delimLength ]))
    chunk = chunk.substring(delimLength)
    position += match[0].length
    return chunk
  }

  return (wholeChunk) => {
    if (wholeChunk === null) {
      // Test can end.
      if (delimiterStack.length !== 1) {
        throw fail`Cannot end in contexts ${delimiterStack.join(' ')}`
      }
    } else {
      propagateContextOverChunk(String(wholeChunk))
    }
    return delimiterStack[delimiterStack.length - 1]
  }
}

module.exports = {
  embedderForContext,
  fail,
  heredocBodyRegExp,
  heredocLabel,
  makeLexer
}
