# Testing rules

- **Local machine cannot execute freshly-built binaries** (application-control policy blocks even
  a hello-world). So locally, **compilation is the gate**: build clean and reason about
  correctness. Run the actual test suite in **CI (GitHub Actions, Linux)** or **Docker**.
- Every new module ships with tests in `backend/tests/test_<module>.cpp`. The suite is
  self-contained (`framework.hpp`), registered with `AF_TEST`, asserted with
  `CHECK` / `CHECK_NEAR` / `CHECK_THROWS`.
- **Determinism:** offline runs (synthetic data + template proposer) must be reproducible — same
  seed → same proposed/selected counts. There is a test for this; keep it green.
- **The leak-free invariant is sacred:** the backtester test uses a perfect predictor to assert
  profitability and a shape-mismatch to assert it throws. Do not weaken these.
- Prefer testing behaviour through the public interface over private internals.
