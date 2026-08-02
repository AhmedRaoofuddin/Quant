# C++ style & clean-code rules

- **Standard:** C++20, no compiler extensions (`-std=c++20`, `CMAKE_CXX_EXTENSIONS OFF`).
- **Warnings are errors in spirit:** the tree must compile clean under `-Wall -Wextra -Wpedantic`.
  Never silence a warning with a cast or pragma without a written reason.
- **Layout:** public interface in `include/alphaforge/<layer>/Name.hpp`, implementation in
  `src/<layer>/Name.cpp`. One primary type per file. Namespace `alphaforge::<layer>`.
- **Ownership:** prefer values and `std::unique_ptr`; pass interfaces by reference. No raw `new`
  outside a factory. Rule of zero — let the compiler generate special members unless you own a
  resource.
- **Errors:** throw typed `alphaforge::Error` subclasses carrying an `ErrorCategory`. Catch the
  narrowest type you can handle; wrap-and-rethrow the rest. Never throw a bare string or `int`.
  Functions that cannot fail are `noexcept`. Auditing/logging must never throw out.
- **Const-correctness & `[[nodiscard]]`:** mark pure queries `const` and value-returning
  functions `[[nodiscard]]`.
- **No look-ahead:** anything touching returns must respect the leak-free convention — today's
  signal only ever meets tomorrow's (pre-shifted) return. Reviews reject look-ahead on sight.
- **Security:** never `eval`/`system` model-generated text. All alpha expressions go through
  `dsl::validate` before evaluation.
- **Comments** explain *why*, not *what*; keep density consistent with the surrounding file.
