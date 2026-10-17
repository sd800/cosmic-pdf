# Marked

Pinned version: 18.1.1 (MIT). Only the self-contained ESM distribution and its complete license are bundled.

Upstream: https://github.com/markedjs/marked/tree/v18.1.1

Reproduce from https://registry.npmjs.org/marked/-/marked-18.1.1.tgz, checking the npm SHA-512 integrity below before extracting `package/lib/marked.esm.js` and `package/LICENSE` (renamed to LICENSE.md). No build or runtime network dependency is needed.

`sha512-zEGgrtUG8crk+TrMacJSVABU4DYDDkS8uqgU3ohrn/2fW9C2AEfUrO3m6IhpIpQpl7YcVpiXXC9cSMWDANT3dg==`

Only Lexer.lex is used. The AI renderer builds a fixed passive DOM allowlist from tokens; never use Marked HTML output, raw model HTML, live links or remote images. Update integrity.json and rerun the focused AI formatting tests when upgrading.
