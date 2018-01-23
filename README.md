<img align="right" src="https://cdn.rawgit.com/mikesamuel/template-tag-common/7f0159bda72d616af30645d49c3c9203c963c0a6/images/logo.png" alt="Sisyphus Logo">

# sh Template Tag

[![Build Status](https://travis-ci.org/mikesamuel/sh-template-tag.svg?branch=master)](https://travis-ci.org/mikesamuel/sh-template-tag)
[![Dependencies Status](https://david-dm.org/mikesamuel/sh-template-tag/status.svg)](https://david-dm.org/mikesamuel/sh-template-tag)
[![npm](https://img.shields.io/npm/v/sh-template-tag.svg)](https://www.npmjs.com/package/sh-template-tag)

Provides a string template tag that makes it easy to compose `sh` and
`bash` command strings by escaping dynamic values based on the context
in which they appear.

## Usage Example

<!--

This mirrors a testcase in ./test/test.js so if you modify this,
be sure to reflect changes there.

-->

```js
const { sh, ShFragment } = require('sh-template-tag')

function echoCommand (a, b, c) {
  return sh`echo -- ${a} "${b}" 'c: ${c}'`
}

console.log(
  '%s',
  echoCommand(
    '; rm -rf / #',
    '$(cat /etc/shadow)',
    '\'"$(cat /etc/shadow)"\n#'))

/*

Logs the below which does not spawn any subshells:

echo -- '; rm -rf / #' "\$(cat /etc/shadow)" 'c: '"'"'"$(cat /etc/shadow)"
#'

*/
```


## API

### <code>sh&#96;...&#96;</code>

A tag handler that escapes values so that they contribute the literal
characters, returning a `ShFragment`.

Values that are `instanceof ShFragment` are not escaped when they
appear outside quotes.

### `new ShFragment(str)`

A [`TypedString`][] subclass that specifies a fragment of a shell
command suitable for embedding outside a quoted string and which
has balanced delimiters.


## Caveats

["Library support for Safe Coding Practices"][chapter7]

> Solving [shell injection][] is a much harder problem than query
> injection since shell scripts tend to call other shell scripts, so
> properly escaping arguments to one script doesn't help if the script
> sloppily composes a sub-shell.

[chapter7]: https://nodesecroadmap.fyi/chapter-7/child-processes.html
[shell injection]: https://nodesecroadmap.fyi/chapter-1/threat-SHP.html
[`TypedString`]: https://www.npmjs.com/package/template-tag-common
