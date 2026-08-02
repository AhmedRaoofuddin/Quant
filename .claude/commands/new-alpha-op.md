---
description: Add a new operator to the Alpha DSL end-to-end (math, registry, validation, docs).
---

Add a new operator `$ARGUMENTS` to the Alpha DSL, touching every layer it needs:

1. **Math**: implement the primitive on `math::Matrix` (`include/alphaforge/math/Matrix.hpp` +
   `src/math/Matrix.cpp`), NaN-aware, with the same rolling/cross-sectional conventions as its
   neighbours.
2. **Registry + eval**: add it to `registry()` (arity) and the `Evaluator::call` dispatch in
   `src/dsl/Expression.cpp`.
3. **Fields/docs**: if it is broadly useful, add an example to `dsl/AlphaLibrary.cpp`.
4. **Tests**: add a case to `tests/test_dsl.cpp` (valid parse + evaluated shape) and, if it has
   interesting numerics, `tests/test_matrix.cpp`.
5. Rebuild clean (`/build`). Keep the grammar and the proposer prompt in sync.
