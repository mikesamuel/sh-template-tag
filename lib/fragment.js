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

const { TypedString } = require('template-tag-common')
const { Mintable } = require('node-sec-patterns')

/**
 * A string wrapper that marks its content as a series of
 * well-formed SQL tokens.
 */
class ShFragment extends TypedString {}
Object.defineProperty(ShFragment, 'contractKey', { value: 'ShFragment' })
const isShFragment = Mintable.verifierFor(ShFragment)

exports.ShFragment = ShFragment
exports.isShFragment = isShFragment
