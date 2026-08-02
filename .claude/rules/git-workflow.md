# Git workflow

- Never commit directly to `main`. Branch: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Small, focused commits. Imperative subject ≤ 72 chars; body explains *why*.
- A change is not done until: builds clean (`-Wall -Wextra -Wpedantic`), tests updated, docs
  touched if behaviour changed.
- Do not commit `build/`, `node_modules/`, `.next/`, `data/`, or `.env.local` (see `.gitignore`).
- Secrets never enter git — they come from the environment / vault (`AF_*`). CI fails on a
  detected secret.
- Open a PR with a description that maps the change to the lifecycle phase it touches.
