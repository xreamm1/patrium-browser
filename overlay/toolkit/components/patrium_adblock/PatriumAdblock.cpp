/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMPtr.h"

#include "PatriumAdblock.h"

namespace {
extern "C" {

// Implemented in Rust.
void patrium_adblock_construct(nsIPatriumAdblock** aResult);
}
}  // namespace

namespace mozilla {

already_AddRefed<nsIPatriumAdblock> ConstructPatriumAdblock() {
  nsCOMPtr<nsIPatriumAdblock> engine;
  patrium_adblock_construct(getter_AddRefs(engine));
  return engine.forget();
}

}  // namespace mozilla
