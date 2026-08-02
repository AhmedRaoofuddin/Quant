---
description: Configure and build the C++ backend, then report any warnings or errors.
---

Build the Alpha-Forge backend and surface problems concisely.

1. Configure (if `backend/build` is missing): `cmake -S backend -B backend/build -G Ninja -DCMAKE_BUILD_TYPE=Release`
2. Build: `cmake --build backend/build`
3. Report only the warnings/errors (grep for `warning:|error:`). The build MUST stay clean under
   `-Wall -Wextra -Wpedantic`. If anything is flagged, fix it in the source, not by suppressing it.

Note: this machine blocks executing freshly-built binaries — do not try to run the output here;
compilation success is the local gate. See `.claude/rules/testing.md`.
