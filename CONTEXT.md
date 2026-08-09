# Executable Reading

This context describes a book that can grow with a reader's ideas and open into source-grounded, executable worlds. Its language keeps the book, the reader's thinking, the runnable model, and the actors inside that model distinct.

## Authority and Invariants

For Agent OS behavior, the authoritative contract is [`docs/architecture/agent-os-behavior-protocol.md`](docs/architecture/agent-os-behavior-protocol.md). It supplements, and does not replace, the transport and persistence contracts in [`docs/architecture/event-protocol.md`](docs/architecture/event-protocol.md), [`docs/architecture/voice-session.md`](docs/architecture/voice-session.md), and [`docs/architecture/voice-native-executable-book.md`](docs/architecture/voice-native-executable-book.md). This file is a machine entry point; the product brief is directional, and the Prototype V2 checklist is a target acceptance contract. A checked item is not an implementation claim until it has current browser/runtime evidence.

Agent OS has three identities in one user-visible turn:

| Identity | Job | Authority boundary |
|---|---|---|
| **阅读陪伴者** | On the active `SourceBlock`, answer, restate the reader's understanding, and propose a source-grounded, revisable `BookThought`. | May emit an answer or thought candidate; never invents a `ReaderIdea`, turns inference into a quote, or changes `WorldState`. |
| **原文守护者** | Check source/version/anchor/evidence and relevance while protecting productive detours. Truly unrelated input receives one honest, gentle soft-return. | May mark uncertainty, evidence gaps, and an open question; must not suppress a useful analogy or shame the reader into returning. |
| **世界机制导演** | Select/compile a reviewed mechanism, explain action preconditions, and arrange evidence-backed local `CharacterObservation`s in causal order. | May propose allowlisted actions and presentation order; never writes money, inventory, orders, or role state. `WorldKernel.decide/evolve` alone produces numeric consequences. |

Shared invariants:

- `ReaderIdea` remains the reader's own final voice/text; `BookThought` is the Agent's source-constrained, versioned, revisable thought. Neither replaces the other, and no hidden chain of thought is stored.
- `SourceBlock` IDs are stable semantic IDs (`smith.b1.c1.division` / `smith.b1.c3.market_extent`); PDF 36/45 are display locations only. Version, content hash, evidence, and anchor drift must fail closed.
- A `MechanismGraph`/relation is a proposal until user review/commit. Only committed, allowlisted commands can reach the world; `EventStore` is the sole fact source and `ReaderWorldUseCase.dispatch` is the only write path.
- LLM output is schema-validated candidate data. It cannot directly write `WorldState`, `EventStore`, graph facts, cash, inventory, orders, or character facts. Every numeric outcome is deterministic and replayable from the same graph revision, seed, ruleset, and action sequence.
- A `CharacterObservation` explains a local state and causal event; it is not free-form NPC fiction. The world stays hidden until the evidence/relationship/Kernel/replay `PlayabilityGate` passes, and results return to PDF 36 ↔ PDF 45.
- Voice is caller-first: only final, source-bound input may create a `ReaderIdea`; Stop, permission denied, unsupported input, ASR uncertainty, retry, and unknown branches remain visible. Silence or partial input does not write domain state.
- `productive_detour` is a valid reading path and may become a `BookThought` experiment/inference. `obvious_off_topic_noise` gets at most one concrete soft-return; if the reader declines, invitation stops and is not repeated.

## Book and Source

**BookArtifact**:
A citable edition of a book prepared for active reading, evidence, and executable worlds. It keeps its source identity even when layout or pagination changes.
_Avoid_: Book file, PDF, ebook package

**SourceBlock**:
The smallest stable, citable part of a BookArtifact that can carry an idea, relation, evidence, or world entry. Its identity comes from its place and content within the artifact; a page number is only a display location and is not the SourceBlock ID.
_Avoid_: Page, screen section, page number

**SourceAnchor**:
The exact place within a SourceBlock to which an idea, relation, or piece of evidence refers. It preserves enough source context for a reader to return to the same passage, figure, table, or region.
_Avoid_: Page reference, loose citation

## Reader Thinking

**ReaderIdea**:
A reader-authored observation, question, hypothesis, objection, or analogy expressed in voice or text and grounded in one or more SourceAnchors. A ReaderIdea is not Memory: it is the reader's attributed intellectual work, not information the product retains merely to preserve continuity.
_Avoid_: Memory, summary, Agent inference

**BookThought**:
A source-constrained thought proposed by the Reading Companion (`quote`, `inference`, or `experiment`) with evidence, confidence, an optional open question, and append-only revisions. It is the Agent's current interpretation, never the reader's `ReaderIdea` and never an unmarked author claim.
_Avoid_: ReaderIdea, hidden chain of thought, unverified quotation

**MechanismGraph**:
A versioned proposal/compile view that connects `SourceBlock`s, `ReaderIdea`s, state variables, and role constraints with typed, evidenced edges. It is not a second fact source: only a reviewed and committed graph can supply allowlisted commands to `WorldKernel`.
_Avoid_: free concept map, committed world state, model JSON

**Memory**:
Information retained to preserve continuity across reading sessions, such as a reader preference, an unfinished path, or a chosen reading goal. It may point to a ReaderIdea, but it does not replace or absorb the idea itself.
_Avoid_: ReaderIdea, ReadingTrace, annotation collection

**ReadingTrace**:
The ordered, reader-visible account of how a reading journey unfolded, including sources visited, ideas expressed, relation decisions, worlds entered, and evidence reviewed. It records meaningful reading moves rather than undifferentiated conversation or operational activity.
_Avoid_: Chat history, telemetry, Memory

**ActiveReadingGraph**:
The living network of SourceBlocks, ReaderIdeas, accepted relations, executable worlds, and evidence that represents the reader's current understanding. Rejected or undecided proposals may remain in the ReadingTrace, but they are not accepted relations in the graph.
_Avoid_: Static concept map, Memory store, undifferentiated knowledge base

**RelationProposal**:
A candidate account of how two parts of the reading world may relate, offered for confirmation, rejection, or revision. It is not a RelationEdge and does not become part of the ActiveReadingGraph merely because an Agent suggested it.
_Avoid_: RelationEdge, fact, accepted relation

**RelationEdge**:
An accepted, typed relationship between two parts of the ActiveReadingGraph, attributable to the source, idea, and decision that support it. A RelationProposal becomes a RelationEdge only after the required judgment has been made.
_Avoid_: RelationProposal, similarity hint, unreviewed inference

**WorldPatch**:
A coherent proposed change to the reader's world, such as adding an idea, accepting a relation, revising an interpretation, or retiring an obsolete connection. It describes what would change, not the complete state of the world.
_Avoid_: WorldRevision, isolated event, Memory update

**WorldRevision**:
A recognizable state of the reader's world after one or more WorldPatches have been accepted. It can be revisited or compared with another revision to understand how the reader's interpretation changed.
_Avoid_: WorldPatch, draft, autosave

## Executable Worlds and Evidence

**ExecutableWorld**:
A bounded, interactive thought experiment in which a reader can act under explicit economic rules and observe consequences connected to the book. It is neither the source text itself nor a universal forecast of the real world.
_Avoid_: Chatbot, animated illustration, reality predictor

**PlayabilityReport**:
An assessment of whether a proposed ExecutableWorld offers understandable choices, visible consequences, traceable evidence, and honest limits. It judges whether an idea supports meaningful play, not whether a visual prototype merely runs.
_Avoid_: Build report, QA checklist, visual review

**InlineWorldBlock**:
A book-native invitation into an ExecutableWorld, placed beside the SourceBlock whose claim or tension it explores. It preserves continuity between reading and acting instead of turning the world into a separate dashboard.
_Avoid_: Sidebar game, unrelated embed, demo panel

**EvidenceBlock**:
A book-native account of what happened in an ExecutableWorld, bringing together the reader's action, observed consequences, relevant source, ModelExtensions, and caveats. It lets the reader inspect the basis of a conclusion rather than simply receive an answer.
_Avoid_: Debug log, scorecard, answer panel

**ModelExtension**:
An explicit, labeled assumption added where the source is silent or underspecified but an ExecutableWorld needs a rule to run. It belongs to the executable model and must never be presented as the author's claim or as source evidence.
_Avoid_: Source claim, quotation, evidence

## Participants

**ReadingAgent**:
The user-visible Agent OS expressed through three coordinated identities: a **阅读陪伴者** that answers from the active source and proposes revisable `BookThought`s; an **原文守护者** that checks evidence while allowing productive detours and offering one gentle soft-return for true noise; and a **世界机制导演** that selects/compiles reviewed mechanisms and arranges local role observations. It does not author the reader's `ReaderIdea`, bypass review, or decide economic consequences; deterministic `WorldKernel` does that.
_Avoid_: 过窄的命令解析器, substitute reader, economic engine, free-form NPC narrator

**EconomicActor**:
A person, organization, household, firm, or role represented inside an ExecutableWorld with resources, aims, constraints, and possible actions. Being an Actor does not imply autonomy: its choices may be set by the reader, by a rule, or by an Agent.
_Avoid_: EconomicAgent, NPC, autonomous character

**EconomicAgent**:
An EconomicActor that chooses actions autonomously from its available information, aims, and constraints. Every EconomicAgent is an EconomicActor, but an EconomicActor is not necessarily an Agent.
_Avoid_: Any EconomicActor, ReadingAgent, scripted character
