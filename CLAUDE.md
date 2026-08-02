# Alpha-Forge — project guide for Claude Code

LLM-augmented quantitative **alpha discovery & allocation** platform. A language model proposes
formulaic alphas as auditable DSL expressions; the C++ engine backtests them leak-free, checks
statistical significance (deflated Sharpe), decorrelates, allocates capital, and evaluates
out-of-sample. Delivered to the **Ministry of Investment AI Development Lifecycle** (6 phases).

## Repository layout

```
alpha-forge/
├── backend/        Modern C++20 engine (the product core)
│   ├── include/alphaforge/{platform,math,domain,data,dsl,engine,selection,allocator,proposer,guardrails,app}
│   ├── src/...     Implementations mirroring include/
│   ├── apps/cli/   The `alphaforge` executable (crawl | discover | list | show | serve)
│   ├── tests/      Self-contained unit + integration suite
│   └── CMakeLists.txt
├── frontend/       Next.js 14 + Tailwind dashboard (Claude design language)
├── supabase/       Local Supabase: schema migration (RLS), config, seed
├── docs/           SDLC phase docs (01–06), architecture, ADRs
├── deploy/         Dockerfiles, docker-compose (dev/test/prod), CI
└── .claude/        Control center: settings, commands, rules, agents
```

## Architecture (clean / hexagonal)

Dependencies point **inward**: `app` → `domain` ← everything. The pipeline depends on
*interfaces* (`IDataSource`, `IRunRepository`, `IPriceRepository`, `IAllocator`), and the
composition root (`app/Factory.cpp`) picks concrete implementations from config. This is why the
same code runs on synthetic data + files locally and on real data + Supabase in production.

Pipeline: **crawl → features → in/out-of-sample split → propose (LLM/offline) → guardrail →
backtest → risk review → select → allocate → OOS portfolio backtest → persist + audit**.

## Build & test (backend)

The toolchain here is scoop-installed GCC 15 + CMake + Ninja. g++ lives at
`~/scoop/apps/gcc/current/bin`.

```bash
cmake -S backend -B backend/build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build backend/build
./backend/build/tests/alphaforge_tests      # run unit + integration tests
./backend/build/alphaforge discover         # run the pipeline (offline, synthetic data)
./backend/build/alphaforge serve            # start REST API on :8000
```

> **Important (this machine):** an application-control policy blocks *executing* freshly-built
> binaries locally — even a hello-world. Compile/link here to verify correctness; **run the tests
> and app in CI or Docker** (Linux), where execution is unrestricted. See
> `.claude/rules/testing.md`.

Optional integrations (off by default, zero-dependency core):
`-DALPHAFORGE_WITH_CURL=ON` (Claude proposer via libcurl) ·
`-DALPHAFORGE_WITH_POSTGRES=ON` (Supabase/Postgres repository via libpq).

## Frontend

```bash
cd frontend && npm install && npm run dev    # http://localhost:3000
```
Reads from Supabase when `NEXT_PUBLIC_SUPABASE_URL` is set, else the C++ REST API
(`NEXT_PUBLIC_API_URL`, default `http://localhost:8000`).

## Conventions

- **C++20**, warnings-as-signal (`-Wall -Wextra -Wpedantic`, must stay clean). Header in
  `include/`, implementation in `src/`, one primary type per file, namespace `alphaforge::<layer>`.
- **Errors are typed exceptions** (`alphaforge::Error` subclasses with an `ErrorCategory`). Catch
  the narrowest type; top-level handlers map category → exit code / HTTP status. No raw `throw`
  of `std::string`.
- **Nothing model-generated is ever `eval`'d** — LLM output is parsed by the DSL and rejected if
  it is not a legal formula over the known field set (`dsl::validate`).
- The **shared data model** (`domain/Types.hpp`) is the only cross-layer contract; no loose maps.

## The 6-phase lifecycle → where it lives

1. **Discovery** → `docs/01-discovery.md`
2. **Development** → `backend/` (data model, engine, agents), `frontend/`, `deploy/`
3. **Governance & Guardrails** → `backend/.../guardrails/`, `supabase/` RLS, `docs/03-governance.md`
4. **Testing** → `backend/tests/`, `docs/04-testing.md`, CI
5. **UAT** → `docs/05-uat.md`
6. **Production** → `deploy/`, `docs/06-production.md`, observability in `platform/Logger`
