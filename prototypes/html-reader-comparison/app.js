/*
 * Reader Surface Lab — THROWAWAY PROTOTYPE
 *
 * No backend and no external model. The HTML source records below are a
 * small, local fixture transcribed from the official OLL Cannan vol. 1 EPUB.
 * The interaction seam is intentionally deterministic so this comparison can
 * be thrown away without taking a production contract with it.
 */

const PDF_URL = "../../assets/public-domain/wealth-of-nations-cannan-vol1.pdf";
const BOOK_REVISION = "oll-cannan-v6";
const SOURCE_DATA = Object.freeze({
  division: Object.freeze({
    key: "division",
    label: "Division of labour",
    source_id: "oll.smith_0206-01_235",
    source_locator: "Smith_0206-01_235",
    page: 36,
    print_page: 19,
    chapter: "BOOK I · CHAPTER I",
    replay: "I think division makes each worker more skilled, but I am not sure how large the market must be.",
  }),
  market: Object.freeze({
    key: "market",
    label: "Market extent",
    source_id: "oll.smith_0206-01_251",
    source_locator: "Smith_0206-01_251",
    page: 45,
    print_page: 20,
    chapter: "BOOK I · CHAPTER III",
    replay: "If the market is too small, a specialist may not sell the surplus and has to do several jobs again.",
  }),
});

const ROLE_ORDER = ["merchant", "shepherd", "spinner", "weaver"];
const ACTIONS = Object.freeze({
  specialize: { label: "Let the weaver specialize", id: "deepen_specialization" },
  expand: { label: "Expand market to the next town", id: "expand_market" },
});

const state = {
  variant: new URLSearchParams(location.search).get("variant") === "pdf" ? "pdf" : "html",
  activeSource: "division",
  evidencePage: 36,
  ideas: [],
  relation: { status: "draft", graph_id: "html-comparison-graph", graph_revision: 1, source_ids: [], evidence_refs: [], stale: false },
  voice: { recording: false, requesting: false, recognition: null, transcript: "", transcriptFinal: false, snapshot: null, generation: 0 },
  world: { phase: "closed", revision: 0, triggerSource: "division", output: 12, stock: 8, orders: 2, cash: 24, market: "small", events: [] },
};

const dom = {
  pdfSurface: document.querySelector("#pdfSurface"),
  htmlSurface: document.querySelector("#htmlSurface"),
  pdfFrame: document.querySelector("#pdfFrame"),
  drawer: document.querySelector("#evidenceDrawer"),
  drawerFrame: document.querySelector("#drawerPdfFrame"),
  drawerSource: document.querySelector("#drawerSourceLabel"),
  activeSourceLabel: document.querySelector("#activeSourceLabel"),
  activeSourceLocator: document.querySelector("#activeSourceLocator"),
  anchorStatus: document.querySelector("#anchorStatus"),
  voiceButton: document.querySelector("#voiceButton"),
  voiceButtonLabel: document.querySelector("#voiceButtonLabel"),
  replayButton: document.querySelector("#replayButton"),
  voiceLed: document.querySelector("#voiceLed"),
  voiceStatus: document.querySelector("#voiceStatus"),
  transcriptBox: document.querySelector("#transcriptBox"),
  voiceSnapshot: document.querySelector("#voiceSnapshot"),
  ideaCount: document.querySelector("#ideaCount"),
  ideaList: document.querySelector("#ideaList"),
  ideaInput: document.querySelector("#ideaInput"),
  addIdeaButton: document.querySelector("#addIdeaButton"),
  relationCard: document.querySelector("#relationCard"),
  relationCopy: document.querySelector("#relationCopy"),
  relationStatus: document.querySelector("#relationStatus"),
  relationRevision: document.querySelector("#relationRevision"),
  confirmRelation: document.querySelector("#confirmRelation"),
  worldSlot: document.querySelector("#worldSlot"),
  worldLoading: document.querySelector("#worldLoading"),
  loadingLabel: document.querySelector("#loadingLabel"),
  loadingProgress: document.querySelector("#loadingProgress"),
  worldAnchorLabel: document.querySelector("#worldAnchorLabel"),
  worldPhase: document.querySelector("#worldPhase"),
  collapseWorld: document.querySelector("#collapseWorld"),
  metricOutput: document.querySelector("#metricOutput"),
  metricStock: document.querySelector("#metricStock"),
  metricOrders: document.querySelector("#metricOrders"),
  metricCash: document.querySelector("#metricCash"),
  metricMarket: document.querySelector("#metricMarket"),
  eventList: document.querySelector("#eventList"),
  eventCount: document.querySelector("#eventCount"),
  stateSource: document.querySelector("#stateSource"),
  stateSnapshot: document.querySelector("#stateSnapshot"),
  stateIdeas: document.querySelector("#stateIdeas"),
  stateWorld: document.querySelector("#stateWorld"),
  footnote: document.querySelector("#footnote-division"),
};

function sourceInfo(sourceKey = state.activeSource) {
  return SOURCE_DATA[sourceKey] || SOURCE_DATA.division;
}

function sourceSnapshot(sourceKey = state.activeSource) {
  const source = sourceInfo(sourceKey);
  return {
    sourceKey: source.key,
    source_id: source.source_id,
    source_locator: source.source_locator,
    book_revision: BOOK_REVISION,
    page: source.page,
    anchor_id: `html-anchor-${source.key}`,
    snapshotId: `${BOOK_REVISION}:${source.source_id}:p${source.page}`,
    startedAt: new Date().toISOString(),
  };
}

function isValidSnapshot(snapshot) {
  return Boolean(snapshot && SOURCE_DATA[snapshot.sourceKey] && snapshot.source_id === SOURCE_DATA[snapshot.sourceKey].source_id && snapshot.book_revision === BOOK_REVISION && snapshot.snapshotId);
}

function setVoiceStatus(message, mode = "idle") {
  if (dom.voiceStatus) dom.voiceStatus.textContent = message;
  if (dom.voiceLed) dom.voiceLed.dataset.state = mode;
}

function setActiveSource(sourceKey, { scroll = false } = {}) {
  if (!SOURCE_DATA[sourceKey]) return false;
  state.activeSource = sourceKey;
  const source = sourceInfo(sourceKey);
  if (dom.activeSourceLabel) dom.activeSourceLabel.textContent = source.label;
  if (dom.activeSourceLocator) dom.activeSourceLocator.textContent = `${source.source_locator} · OLL EPUB · PDF ${source.page}`;
  if (dom.stateSource) dom.stateSource.textContent = source.source_id;
  document.querySelectorAll("[data-source-key]").forEach((node) => node.classList.toggle("is-active", node.dataset.sourceKey === sourceKey));
  document.querySelectorAll("[data-focus-source]").forEach((button) => button.classList.toggle("is-current", button.dataset.focusSource === sourceKey));
  if (dom.anchorStatus) dom.anchorStatus.innerHTML = `<i></i> anchor ready · PDF ${source.page}`;
  if (scroll && state.variant === "html") document.querySelector(`[data-source-key="${sourceKey}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

function setVariant(variant, { updateUrl = true } = {}) {
  state.variant = variant === "pdf" ? "pdf" : "html";
  if (dom.pdfSurface) dom.pdfSurface.hidden = state.variant !== "pdf";
  if (dom.htmlSurface) dom.htmlSurface.hidden = state.variant !== "html";
  document.querySelectorAll("[data-variant-link]").forEach((link) => {
    const active = link.dataset.variantLink === state.variant;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  if (updateUrl) history.replaceState({}, "", `?variant=${state.variant}`);
  renderState();
}

function relationFromIdeas() {
  const sourceIds = [...new Set(state.ideas.map((idea) => idea.source_id))];
  const evidenceRefs = [...new Set(state.ideas.flatMap((idea) => idea.evidence_refs || []))];
  state.relation = {
    ...state.relation,
    source_ids: sourceIds,
    evidence_refs: evidenceRefs,
    status: sourceIds.length >= 2 ? (state.relation.status === "committed" && !state.relation.stale ? "committed" : "needs_review") : "draft",
  };
}

function markRelationStale(reason = "idea_revision") {
  if (state.relation.status !== "committed" && state.world.phase !== "open") return;
  state.relation = { ...state.relation, status: "needs_review", stale: true, stale_reason: reason };
  state.world = { ...state.world, phase: "closed", revision: state.world.revision + 1, events: [] };
  if (dom.worldSlot) { dom.worldSlot.hidden = true; dom.worldSlot.dataset.state = "closed"; }
}

function addIdea(text, sourceKey = state.activeSource, { origin = "text", confidence = "medium", snapshot = null } = {}) {
  const value = String(text || "").trim();
  if (!value || !SOURCE_DATA[sourceKey]) return false;
  const source = sourceInfo(sourceKey);
  const existing = state.ideas.find((idea) => idea.sourceKey === sourceKey);
  const now = new Date().toISOString();
  if (existing) {
    if (existing.text === value) return true;
    markRelationStale("same_source_revision");
    const nextRevision = existing.revision + 1;
    existing.revision_history.push({ revision: nextRevision, text: value, previous_text: existing.text, changed_by: origin, changed_at: now });
    existing.text = value;
    existing.revision = nextRevision;
    existing.status = "revised";
    existing.confidence = confidence;
    existing.updatedAt = now;
  } else {
    state.ideas.push({
      id: `reader-idea-${sourceKey}-${Date.now()}`,
      turn_id: `turn-${Date.now()}-${sourceKey}`,
      sourceKey,
      source_id: source.source_id,
      source_anchor: { source_locator: source.source_locator, book_revision: BOOK_REVISION, page: source.page, snapshot_id: snapshot?.snapshotId || `anchor:${sourceKey}` },
      evidence_refs: [`${source.source_locator}`, `pdf:${source.page}`],
      confidence,
      status: "captured",
      revision: 1,
      revision_history: [{ revision: 1, text: value, changed_by: origin, changed_at: now }],
      text: value,
      origin,
      createdAt: now,
      updatedAt: now,
    });
  }
  setActiveSource(sourceKey);
  relationFromIdeas();
  renderState();
  return true;
}

function renderIdeas() {
  if (!dom.ideaList) return;
  dom.ideaList.replaceChildren();
  if (!state.ideas.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Use Replay on each source, or leave a text idea below.";
    dom.ideaList.appendChild(empty);
  }
  state.ideas.forEach((idea) => {
    const item = document.createElement("article");
    item.className = "idea-item";
    item.innerHTML = `<strong>${sourceInfo(idea.sourceKey).label} · r${idea.revision}</strong><span>${idea.source_id} · ${idea.status}</span><p>${escapeHtml(idea.text)}</p>`;
    dom.ideaList.appendChild(item);
  });
  if (dom.ideaCount) dom.ideaCount.textContent = `${state.ideas.length} / 2`;
}

function renderRelation() {
  relationFromIdeas();
  const ready = state.relation.source_ids.length >= 2;
  if (dom.relationCard) dom.relationCard.dataset.status = state.relation.status;
  if (dom.relationStatus) dom.relationStatus.textContent = state.relation.status;
  if (dom.relationRevision) dom.relationRevision.textContent = `graph r${state.relation.graph_revision}`;
  if (dom.relationCopy) dom.relationCopy.textContent = ready ? (state.relation.stale ? "An Idea changed. Review the current source/evidence pair before reopening the world." : "Typed edge: specialization constrains market extent. Source evidence is compiled from both current Ideas.") : "Add both source anchors to propose a typed relation.";
  if (dom.confirmRelation) {
    dom.confirmRelation.disabled = !ready || state.relation.status === "committed";
    dom.confirmRelation.textContent = state.relation.status === "committed" ? "Relation committed ✓" : "Confirm relation";
  }
}

function renderWorld() {
  const world = state.world;
  if (dom.metricOutput) dom.metricOutput.textContent = String(world.output).padStart(2, "0");
  if (dom.metricStock) dom.metricStock.textContent = String(world.stock).padStart(2, "0");
  if (dom.metricOrders) dom.metricOrders.textContent = String(world.orders).padStart(2, "0");
  if (dom.metricCash) dom.metricCash.textContent = String(world.cash).padStart(2, "0");
  if (dom.metricMarket) dom.metricMarket.textContent = world.market;
  if (dom.worldPhase) dom.worldPhase.textContent = world.phase === "open" ? "WORLD LIVE" : world.phase.toUpperCase();
  if (dom.worldAnchorLabel) dom.worldAnchorLabel.textContent = `Triggered from ${sourceInfo(world.triggerSource).source_locator} · PDF ${sourceInfo(world.triggerSource).page}`;
  if (dom.eventCount) dom.eventCount.textContent = `${world.events.length} events`;
  if (dom.eventList) {
    dom.eventList.replaceChildren();
    if (!world.events.length) {
      const empty = document.createElement("li");
      empty.className = "feed-empty";
      empty.textContent = "Run an action to append observations inside this fixed stage.";
      dom.eventList.appendChild(empty);
    } else {
      world.events.forEach((event) => {
        const item = document.createElement("li");
        item.innerHTML = `<span>${event.id} · ${event.role}</span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.text)}</small>`;
        dom.eventList.appendChild(item);
      });
      dom.eventList.lastElementChild?.scrollIntoView({ block: "nearest" });
    }
  }
  ROLE_ORDER.forEach((role) => {
    const card = document.querySelector(`[data-role="${role}"]`);
    if (!card) return;
    const last = [...world.events].reverse().find((event) => event.role === role);
    card.classList.toggle("is-active", Boolean(last));
    const status = card.querySelector("span");
    if (status) status.textContent = last?.text || "waiting for an action";
  });
}

function renderState() {
  setActiveSource(state.activeSource);
  renderIdeas();
  renderRelation();
  renderWorld();
  if (dom.stateSnapshot) dom.stateSnapshot.textContent = state.voice.snapshot?.snapshotId || "—";
  if (dom.stateIdeas) dom.stateIdeas.textContent = `${state.ideas.length} · ${state.ideas.map((idea) => `r${idea.revision}`).join(", ") || "none"}`;
  if (dom.stateWorld) dom.stateWorld.textContent = `${state.world.phase} · r${state.world.revision}`;
}

function rememberSourceViewport() {
  const sourceNode = document.querySelector(`[data-source-key="${state.activeSource}"]`);
  return { sourceKey: state.activeSource, top: sourceNode?.getBoundingClientRect().top ?? 120 };
}

function restoreSourceViewport(anchor) {
  if (!anchor) return;
  const sourceNode = document.querySelector(`[data-source-key="${anchor.sourceKey}"]`);
  if (sourceNode && state.variant === "html") {
    const delta = sourceNode.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 2) window.scrollBy(0, delta);
    sourceNode.focus({ preventScroll: true });
  } else if (state.variant === "pdf") {
    dom.pdfSurface?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function beginWorldLoading() {
  if (state.relation.status !== "committed") return false;
  const anchor = rememberSourceViewport();
  state.world = { ...state.world, phase: "loading", revision: state.world.revision + 1, triggerSource: state.activeSource, anchor, events: [] };
  dom.worldSlot.hidden = false;
  dom.worldSlot.dataset.state = "loading";
  dom.worldSlot.setAttribute("aria-busy", "true");
  dom.loadingProgress.style.width = "8%";
  dom.loadingLabel.textContent = "Compiling relation evidence…";
  document.querySelectorAll(".loading-steps li").forEach((step) => step.classList.remove("is-done"));
  const steps = [...document.querySelectorAll(".loading-steps li")];
  const stages = ["Reading two source anchors…", "Checking market constraint…", "Reserving fixed world stage…"];
  let index = 0;
  const timer = window.setInterval(() => {
    steps[index]?.classList.add("is-done");
    index += 1;
    dom.loadingProgress.style.width = `${Math.min(100, 8 + index * 31)}%`;
    dom.loadingLabel.textContent = stages[index] || "World state ready.";
    if (index >= stages.length) {
      window.clearInterval(timer);
      window.setTimeout(() => openWorld(anchor), 180);
    }
  }, 320);
  return true;
}

function openWorld(anchor) {
  state.world.phase = "open";
  state.world.revision += 1;
  dom.worldSlot.dataset.state = "open";
  dom.worldSlot.setAttribute("aria-busy", "false");
  renderState();
  window.requestAnimationFrame(() => restoreSourceViewport(anchor));
}

function collapseWorld() {
  const anchor = state.world.anchor;
  state.world.phase = "closed";
  state.world.revision += 1;
  dom.worldSlot.hidden = true;
  dom.worldSlot.dataset.state = "closed";
  dom.worldSlot.setAttribute("aria-busy", "false");
  renderState();
  restoreSourceViewport(anchor);
}

function runWorldAction(actionKey) {
  if (state.world.phase !== "open") return { ok: false, code: "WORLD_NOT_OPEN" };
  const action = ACTIONS[actionKey];
  if (!action) return { ok: false, code: "ACTION_UNSUPPORTED" };
  state.world.revision += 1;
  const base = { revision: state.world.revision, action_id: action.id };
  if (actionKey === "specialize") {
    const threshold = 4;
    if (state.world.orders < threshold) {
      state.world.events.push({ ...base, id: `event-${state.world.events.length + 1}`, role: "weaver", title: "Weaver refuses another specialization step", text: `Only ${state.world.orders} reachable orders; the weaver keeps the current workflow. Output, stock, orders and cash stay unchanged.` });
      renderWorld();
      return { ok: true, code: "CHARACTER_REFUSAL", numeric_changed: false };
    }
  }
  if (actionKey === "expand") {
    const before = { output: state.world.output, stock: state.world.stock, orders: state.world.orders, cash: state.world.cash };
    state.world.output = 17;
    state.world.stock = 11;
    state.world.orders = 4;
    state.world.cash = 28;
    state.world.market = "next town";
    const observations = [
      ["merchant", "Merchant opens the next-town route; orders become reachable."],
      ["shepherd", "Shepherd sends two bundles of wool into the exchange chain."],
      ["spinner", "Spinner receives input and turns it into yarn for the weaver."],
      ["weaver", "Weaver accepts the next specialization step now that orders clear the threshold."],
    ];
    observations.forEach(([role, text], index) => state.world.events.push({ ...base, id: `event-${state.world.events.length + 1}`, role, title: `${role} observation ${index + 1}`, text }));
    renderWorld();
    return { ok: true, code: "WORLD_EVENT_RECORDED", numeric_changed: JSON.stringify(before) !== JSON.stringify({ output: state.world.output, stock: state.world.stock, orders: state.world.orders, cash: state.world.cash }), order: ROLE_ORDER };
  }
  return { ok: true, code: "ACTION_WAITING" };
}

function updateTranscript(text, final = false) {
  state.voice.transcript = String(text || "").trim();
  state.voice.transcriptFinal = final;
  if (dom.transcriptBox) dom.transcriptBox.textContent = state.voice.transcript || (final ? "No final transcript in this round." : "Listening…");
}

function commitVoiceTranscript() {
  const snapshot = state.voice.snapshot;
  if (!state.voice.transcript || !state.voice.transcriptFinal || !isValidSnapshot(snapshot)) return false;
  addIdea(state.voice.transcript, snapshot.sourceKey, { origin: "voice", confidence: "high", snapshot });
  setVoiceStatus(`Saved to ${snapshot.source_locator}; source frozen at speech start.`, "idle");
  return true;
}

function stopVoice({ commit = true } = {}) {
  if (!state.voice.recording && !state.voice.requesting) return false;
  state.voice.recording = false;
  state.voice.requesting = false;
  state.voice.generation += 1;
  try { state.voice.recognition?.stop(); } catch { /* browser may already be stopped */ }
  state.voice.recognition = null;
  if (commit) commitVoiceTranscript();
  if (dom.voiceButtonLabel) dom.voiceButtonLabel.textContent = "Start microphone";
  if (!state.voice.transcriptFinal) setVoiceStatus("Stopped without a final transcript; no Idea was added.", "idle");
  return true;
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (state.voice.recording) return stopVoice({ commit: true });
  if (state.voice.requesting) { setVoiceStatus("Still requesting permission; a second request was ignored.", "requesting"); return false; }
  if (!Recognition) { setVoiceStatus("SpeechRecognition is unavailable here. Use Replay fixture instead.", "idle"); return false; }
  const snapshot = sourceSnapshot(state.activeSource);
  state.voice.snapshot = snapshot;
  state.voice.requesting = true;
  state.voice.recording = false;
  state.voice.transcript = "";
  state.voice.transcriptFinal = false;
  state.voice.generation += 1;
  const generation = state.voice.generation;
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onstart = () => {
    if (generation !== state.voice.generation) return;
    state.voice.requesting = false;
    state.voice.recording = true;
    if (dom.voiceButtonLabel) dom.voiceButtonLabel.textContent = "Stop and save this round";
    setVoiceStatus(`Listening · frozen to ${snapshot.source_locator}`, "recording");
  };
  recognition.onresult = (event) => {
    if (generation !== state.voice.generation || !state.voice.recording) return;
    let finalText = "";
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    updateTranscript(finalText || interim, Boolean(finalText));
    if (finalText) commitVoiceTranscript();
  };
  recognition.onerror = (event) => {
    if (generation !== state.voice.generation) return;
    state.voice.requesting = false;
    state.voice.recording = false;
    state.voice.recognition = null;
    setVoiceStatus(event.error === "not-allowed" ? "Microphone permission denied. Replay is still available." : `SpeechRecognition error: ${event.error || "unknown"}.`, "idle");
    if (dom.voiceButtonLabel) dom.voiceButtonLabel.textContent = "Start microphone";
  };
  recognition.onend = () => {
    if (generation !== state.voice.generation) return;
    if (state.voice.recording) stopVoice({ commit: true });
  };
  state.voice.recognition = recognition;
  setVoiceStatus(`Requesting microphone · source frozen to ${snapshot.source_locator}`, "requesting");
  try { recognition.start(); } catch (error) {
    state.voice.requesting = false;
    state.voice.recording = false;
    state.voice.recognition = null;
    setVoiceStatus("SpeechRecognition could not start. Use Replay fixture instead.", "idle");
    return false;
  }
  return true;
}

function replayVoice(sourceKey = state.activeSource) {
  if (!SOURCE_DATA[sourceKey]) return false;
  if (state.voice.recording || state.voice.requesting) stopVoice({ commit: false });
  const snapshot = sourceSnapshot(sourceKey);
  state.voice.snapshot = snapshot;
  updateTranscript(sourceInfo(sourceKey).replay, true);
  addIdea(sourceInfo(sourceKey).replay, sourceKey, { origin: "replay", confidence: "high", snapshot });
  setVoiceStatus(`Replay saved to ${snapshot.source_locator}; anchor frozen at click.`, "idle");
  return true;
}

function setPdfPage(page) {
  const pageNumber = Number(page) === 45 ? 45 : 36;
  state.evidencePage = pageNumber;
  if (dom.pdfFrame) dom.pdfFrame.src = `${PDF_URL}#page=${pageNumber}`;
  document.querySelectorAll("[data-pdf-page]").forEach((button) => button.classList.toggle("is-current", Number(button.dataset.pdfPage) === pageNumber));
}

function openEvidence() {
  const source = sourceInfo(state.activeSource);
  state.evidencePage = source.page;
  if (dom.drawerSource) dom.drawerSource.textContent = `${source.source_locator} · HTML quote · PDF page ${source.page}`;
  if (dom.drawerFrame) dom.drawerFrame.src = `${PDF_URL}#page=${source.page}`;
  if (dom.drawer) dom.drawer.hidden = false;
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function wireUi() {
  document.querySelectorAll("[data-variant-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); setVariant(link.dataset.variantLink); }));
  document.querySelectorAll("[data-focus-source]").forEach((button) => button.addEventListener("click", () => setActiveSource(button.dataset.focusSource, { scroll: true })));
  document.querySelectorAll("[data-replay-source]").forEach((button) => button.addEventListener("click", () => replayVoice(button.dataset.replaySource)));
  document.querySelectorAll("[data-add-source]").forEach((button) => button.addEventListener("click", () => { setActiveSource(button.dataset.addSource, { scroll: false }); dom.ideaInput?.focus(); }));
  document.querySelectorAll("[data-pdf-page]").forEach((button) => button.addEventListener("click", () => { setPdfPage(button.dataset.pdfPage); setActiveSource(Number(button.dataset.pdfPage) === 45 ? "market" : "division"); }));
  document.querySelectorAll("[data-footnote]").forEach((button) => button.addEventListener("click", () => { dom.footnote.hidden = false; }));
  document.querySelectorAll("[data-close-popover]").forEach((button) => button.addEventListener("click", () => { dom.footnote.hidden = true; }));
  document.querySelectorAll("[data-close-drawer]").forEach((button) => button.addEventListener("click", () => { dom.drawer.hidden = true; }));
  dom.voiceButton?.addEventListener("click", () => startVoice());
  dom.replayButton?.addEventListener("click", () => replayVoice());
  dom.addIdeaButton?.addEventListener("click", () => { const value = dom.ideaInput?.value.trim(); if (!value) return; addIdea(value, state.activeSource, { origin: "text", confidence: "medium" }); dom.ideaInput.value = ""; });
  dom.confirmRelation?.addEventListener("click", () => { if (state.relation.source_ids.length >= 2) { state.relation.status = "committed"; state.relation.stale = false; state.world.triggerSource = state.activeSource; renderState(); beginWorldLoading(); } });
  dom.collapseWorld?.addEventListener("click", collapseWorld);
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => runWorldAction(button.dataset.action)));
  document.querySelector("#openEvidenceButton")?.addEventListener("click", openEvidence);
  window.addEventListener("keydown", (event) => {
    if (event.target?.matches?.("textarea, input")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); setVariant("pdf"); }
    if (event.key === "ArrowRight") { event.preventDefault(); setVariant("html"); }
  });
}

function init() {
  wireUi();
  setPdfPage(36);
  setVariant(state.variant, { updateUrl: false });
  setActiveSource(state.activeSource);
  renderState();
  window.__htmlReaderComparison = {
    state,
    setVariant,
    setActiveSource,
    addIdea,
    startVoice,
    stopVoice,
    replayVoice,
    confirmRelation: () => { if (dom.confirmRelation && !dom.confirmRelation.disabled) dom.confirmRelation.click(); },
    runWorldAction,
    collapseWorld,
    openEvidence,
    getState: () => JSON.parse(JSON.stringify(state)),
  };
}

init();
