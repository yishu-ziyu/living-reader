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

## Model Routing and Delegation

`Sol` is the default primary model for this project. It owns task understanding, decomposition, routing, integration, and final acceptance. Whenever Sol delegates work, every `Terra` or `Luna` Sub-Agent must run at the `Max` reasoning level; do not silently downgrade it.

| Route | Use for |
|---|---|
| `Sol` | Requirement understanding, architecture, complex bugs, cross-file refactors, CI-system design, database migrations, difficult diagnosis, and long-running autonomous work |
| `Terra Max` | Normal feature development, ordinary refactors, focused test writing, routine bug fixes, and code review |
| `Luna Max` | Copy edits, CSS changes, simple components, file discovery, bounded mechanical batch changes, test scaffolding, and lightweight parallel Sub-Agent lanes |

- Route by the actual task shape, risk, and discovered complexity, not by file count or Agent identity.
- Sol must give each Sub-Agent a bounded scope, forbidden areas, completion criteria, and evidence to return. Sol remains responsible for integrating the result and judging completion.
- A delegated lane that discovers architectural risk, hidden cross-file coupling, migration work, or scope ambiguity must stop expanding and return evidence to Sol for rerouting.
- Model routing does not create model-specific Teable queues, fields, or lifecycles. Every Agent and Sub-Agent still follows [`docs/agents/task-routing.md`](docs/agents/task-routing.md).

## Cross-Session Consistency

Consistency is a primary engineering constraint for this long-running project. A fresh session or a different contributor should recover the same intent, vocabulary, authority boundaries, and quality bar from project-owned evidence. The target is a repeatable decision process, not identical code from every contributor.

- Before any project work, every long-lived Agent and every delegated subagent must follow [`docs/agents/task-routing.md`](docs/agents/task-routing.md) and read the relevant Teable task record. Long-lived Agents claim or confirm their work in Teable; subagents read the parent task, work only their assigned lane, and return evidence to the parent Agent. No Teable read means no implementation or acceptance work begins.
- Before any visual, UI, UX, interaction, or user-visible flow work, read the root [`design.md`](design.md). It owns the product-design constitution, accepted experience boundaries, design decisions, and design acceptance criteria. Implement `Accepted` decisions as constraints; treat `Proposed` and `Open` items as unresolved and obtain the required prototype, evidence, or user judgment before turning them into production behavior. Do not infer design authority from the current UI, a screenshot, a prototype, or a Teable task alone when it conflicts with `design.md`.
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
- Behavior changes must add or update a focused regression test. Never make CI green by deleting or skipping tests, weakening assertions, or lowering lint, typecheck, test, or build strictness. If an applicable check fails, fix the cause or report the blocker; do not claim completion.
- Do not add a test, shard, workflow, retry, timeout, cache layer, or testing abstraction without naming the regression it catches, its trigger paths, and its time budget.
- If PR CI approaches 10 minutes, reduce scope or duplication. Fifteen minutes is a hard stop; do not first solve it by increasing timeout or machine size.
- Every handoff states: affected behavior, exact commands run, visible path checked, checks not run, and residual risk. Never report “all tests passed” unless the full suite actually ran.

## Lessons

- 2026-08-09: Treating more tests and more CI gates as automatically safer can make every small change run the full suite and stall product progress → use the smallest sufficient test set for the current change, keep full validation at shared-risk, merge, and release boundaries, and require explicit path filters for expensive CI.
- 2026-08-09: Role-specific queues make every new Agent add another field, view, and handoff rule → all long-lived Agents share one Teable `可领取任务` pool and one lifecycle; identity is recorded only in `负责人`, while subagents return evidence to their parent.
- 2026-08-09: Answering where a prototype “appears” with its filesystem path misses the product question → explain the user-journey trigger, visible state, and implementation tasks that bring the approved direction into `product/`.
- 2026-08-09: Preserving the accepted Agent conversation experience means reusing the real `thinking-orbs` component and T024's single rail capsule -> never replace it with a hand-drawn canvas, a giant dark modal, or a visual reinterpretation that only keeps the state labels.
- 2026-08-09: PNG/WebP is only the raster art layer, never the world renderer or a static substitute → preserve the settled state-driven interaction in DOM/CSS + Web Animations, with live character actions, material flow, metrics, interruption, and replay; SVG remains prohibited.
- 2026-08-09: Treating an OMP-native workflow request as a plugin-inventory problem obscures the user's goal → configure OMP roles, subagents, isolation, and Advisor directly, and discuss third-party Skills only when they affect that setup.
- 2026-08-09: Reducing Living Reader's Agent OS to a single constrained model turn misses the product itself → evaluate Agent architecture across the persistent reading relationship, memory, source grounding, relation/world evolution, tool use, interruption, and replay before judging whether to embed a general Agent runtime.
- 2026-08-09: “Use Luna Max as much as possible” does not make it the primary model → keep Sol Max as the main orchestrator, route routine specialist and worker roles to Luna Max, and use Terra Max for independent Advisor and review roles.
- 2026-08-09: Starting architecture research from chat before creating or updating the Teable task loses scope and evidence across sessions → create or update the task, re-read the persisted contract, and only then inspect the repository or propose changes.
- 2026-08-09: Inferring repository architecture from a few selected files causes confident but incomplete conclusions → map the repository with CodeGraph or the strongest available structural code-intelligence tool first, then confirm critical call, state, persistence, and recovery paths with LSP, source, tests, and runtime evidence.
- 2026-08-09: Showing technical implementation steps or a large task batch before the user can judge the product effect makes the plan opaque → discuss at most two user-perceivable behavior atoms at a time in the TUI, using plain language to explain what the user does, what visibly changes, why it matters, and how the user will verify it; keep code-level decomposition internal, persist only explicitly approved behaviors to Teable, dispatch approved work while confirming the next pair, parallelize independent files but keep shared hotspots single-writer, and mark work complete only after the user checks the website and says it is OK.
- 2026-08-09: Asking the user to choose between reading first and world first created a false dichotomy → model the intended product as one continuous loop from full-book import and translated reading, through Agent conversation and reading memory, into a reader-approved executable world, then back to the book with new understanding.
- 2026-08-09: Calling the experience a needle-factory game collapses the product into one implementation scene and the wrong category → describe it as an executable economic world that grows from the current book and reader question, with the needle factory only one possible Wealth of Nations instance.
