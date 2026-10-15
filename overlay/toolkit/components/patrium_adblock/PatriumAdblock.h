/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PATRIUM_ADBLOCK_PATRIUM_ADBLOCK_H_
#define PATRIUM_ADBLOCK_PATRIUM_ADBLOCK_H_

#include "mozilla/AlreadyAddRefed.h"
#include "nsIPatriumAdblock.h"

namespace mozilla {

already_AddRefed<nsIPatriumAdblock> ConstructPatriumAdblock();

}  // namespace mozilla

#endif  // PATRIUM_ADBLOCK_PATRIUM_ADBLOCK_H_
