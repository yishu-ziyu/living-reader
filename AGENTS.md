# Living Reader Project Agreement

## Think Before Coding

- Read the relevant code, call sites, tests, and contracts before editing. Search for existing patterns and utilities before creating new ones.
- State assumptions. Surface multiple interpretations; do not pick silently.
- Push back when a simpler approach exists.
- If unclear, stop and ask — do not invent requirements.

## Simplicity First (Non-Negotiable)

Minimum code that solves the problem. Nothing speculative.

- Do NOT implement features that were not requested.
- Do NOT introduce abstractions for single-use code.
- Do NOT add "flexibility", "configurability", or options nobody asked for.
- Do NOT add error handling for scenarios that cannot occur.
- If you write ~200 lines and 50 would do, rewrite before claiming done.

Self-check: Would a senior engineer call this overcomplicated? If yes, simplify.

## Surgical Changes

- Touch only what the task requires. No drive-by refactors.
- Clean up only dead code or unused imports that YOUR change created.
- Mention pre-existing dead code; do not delete it unless asked.
- Match the project's established architecture and style. Preserve externally observable behavior unless the request changes it.
- Comments should explain non-obvious intent, constraints, ownership, or lifecycle rules. Do not narrate obvious code or leave relocation breadcrumbs.

## Goal-Driven

- Define falsifiable success checks before implementing.
- Loop: implement → verify against those checks → only then say done.

## Cross-Session Consistency

Consistency is a primary engineering constraint for this long-running project. A fresh session or a different contributor should recover the same intent, vocabulary, authority boundaries, and quality bar from project-owned evidence. The target is a repeatable decision process, not identical code from every contributor.

- Selectively use and adapt [Matt Pocock's engineering skills](https://github.com/mattpocock/skills) when their task shape fits: alignment interviews, domain modeling, tracer-bullet slicing, TDD/diagnosis, codebase design, review, wayfinding, and handoff. Treat them as small composable methods, not an all-or-nothing process. Current user instructions, this agreement, and project contracts remain authoritative when a skill differs.
- Re-establish current truth at the start of every implementation or acceptance session: confirm the exact workspace/worktree and Git state; read the nearest applicable `AGENTS.md`; load the relevant `CONTEXT.md`, task, architecture/ADR, acceptance contract, current diff, and runtime evidence. Conversation history and handoff claims are orientation, not proof.
- Keep one source of truth per kind of fact: `AGENTS.md` owns working rules; `CONTEXT.md` owns shared domain language and invariants; architecture docs and ADRs own durable design decisions; Teable owns task scope, status, ownership, dependencies, and acceptance evidence; code, tests, and current runtime evidence own implementation state. A handoff owns no durable fact—it points to these sources and records only the current delta.
- Write durable knowledge back to its owning surface as soon as the decision changes. Do not leave a renamed domain term, changed contract, task transition, or acceptance result only in chat. Do not copy the same decision into several summaries; update the authority and link to it.
- Slice implementation into narrow, end-to-end tracer bullets that are independently demoable or verifiable and fit within one fresh context window. State scope, blockers, owner, acceptance criteria, and the visible path before parallel work. For work whose route is still unclear, map decision questions and the current frontier; do not pre-plan detail hidden by fog.
- End a session with a recoverable checkpoint whenever work remains: update Teable first, then record the objective, completed and incomplete work, decisions with links to their authorities, changed paths, exact checks and results, visible path exercised, blockers, residual risk, and the next smallest action. Suggest relevant skills when useful, reference existing artifacts instead of reproducing them, and redact secrets.
- Resume from a checkpoint by validating its mutable claims against Git, Teable, code, tests, and runtime before editing. If sources conflict or ownership is unclear, stop and resolve the authority conflict rather than silently choosing one version.

## Testing and CI

- The user owns the idea, product intent, and final experience judgment. The agent owns implementation, test selection, execution, and an evidence-based handoff.
- Classify every change by semantic impact, not line count: docs-only, product-local, shared-contract, or release/deployment.
- For any `product/` code or configuration change, run `pnpm --dir product check:quick` before handoff.
- For user-visible or module behavior changes, also run the smallest relevant Playwright path listed in [`docs/testing-and-ci.md`](docs/testing-and-ci.md). A green quick check does not replace the visible user path.
- Run `pnpm --dir product check:full` for shared contracts, dependencies, build/test configuration, cross-module changes, release candidates, or when targeted evidence is insufficient. CI runs it again after changes reach `main`.
- Do not add a test, shard, workflow, retry, timeout, cache layer, or testing abstraction without naming the regression it catches, its trigger paths, and its time budget.
- If PR CI approaches 10 minutes, reduce scope or duplication. Fifteen minutes is a hard stop; do not first solve it by increasing timeout or machine size.
- Every handoff states: affected behavior, exact commands run, visible path checked, checks not run, and residual risk. Never report “all tests passed” unless the full suite actually ran.

## Lessons

- 2026-08-09: Treating more tests and more CI gates as automatically safer can make every small change run the full suite and stall product progress → use the smallest sufficient test set for the current change, keep full validation at shared-risk, merge, and release boundaries, and require explicit path filters for expensive CI.
