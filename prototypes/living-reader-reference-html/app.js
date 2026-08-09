/*
 * THROWAWAY PROTOTYPE — HTML-first Living Reader reference.
 *
 * This file deliberately keeps the state machine small and deterministic. It
 * is a seam for trying the reading composition, not a production Agent OS.
 */

(() => {
  "use strict";

  const PDF_URL = "../../assets/public-domain/wealth-of-nations-cannan-vol1.pdf";
  const BOOK_REVISION = "oll-cannan-v6";
  const GRAPH_ID = "reference-html-graph";
  const GRAPH_REVISION = 1;
  const ROLE_ORDER = ["merchant", "shepherd", "spinner", "weaver"];

  const SOURCES = {
    division: {
      key: "division",
      label: "分工与熟练度",
      source_id: "oll.smith_0206-01_235",
      source_locator: "Smith_0206-01_235",
      pdf_page: 36,
      print_page: 19,
      quote: "THE greatest improvement in the productive powers of labour, and the greater part of the skill, dexterity, and judgment with which it is any where directed, or applied, seem to have been the effects of the division of labour.",
      replay: "分工会让每个人更熟练吗？"
    },
    market: {
      key: "market",
      label: "市场范围",
      source_id: "oll.smith_0206-01_251",
      source_locator: "Smith_0206-01_251",
      pdf_page: 45,
      print_page: 20,
      quote: "AS it is the power of exchanging that gives occasion to the division of labour, so the extent of this division must always be limited by the extent of that power, or, in other words, by the extent of the market.",
      replay: "如果市场太小，专门做一道工序的人可能卖不掉剩余产出。"
    }
  };

  const state = {
    activeSource: "division",
    ideas: [],
    relation: {
      status: "draft",
      stale: false,
      graph_id: GRAPH_ID,
      graph_revision: GRAPH_REVISION,
      source_ids: [],
      evidence_refs: []
    },
    voice: {
      recording: false,
      requesting: false,
      recognition: null,
      transcript: "",
      snapshot: null,
      generation: 0,
      startedAt: 0,
      timer: null
    },
    world: {
      phase: "closed",
      revision: 0,
      triggerSource: "division",
      anchor: null,
      output: 12,
      stock: 8,
      orders: 2,
      cash: 24,
      market: "小市场",
      events: []
    }
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const node = {
    shell: $("#appShell"),
    bookPage: $("#bookPage"),
    worldSlot: $("#worldSlot"),
    rail: $(".agent-rail"),
    worldLoading: $("#worldLoading"),
    worldOpen: $("#worldOpen"),
    loadingTitle: $("#loadingTitle"),
    loadingCopy: $("#loadingCopy"),
    loadingProgress: $("#loadingProgress"),
    worldPhase: $("#worldPhase"),
    worldAnchorLabel: $("#worldAnchorLabel"),
    worldLog: $("#worldLog"),
    eventList: $("#eventList"),
    eventCount: $("#eventCount"),
    metricOutput: $("#metricOutput"),
    metricStock: $("#metricStock"),
    metricOrders: $("#metricOrders"),
    metricCash: $("#metricCash"),
    metricMarket: $("#metricMarket"),
    ideaList: $("#ideaList"),
    ideaInput: $("#ideaInput"),
    saveIdeaButton: $("#saveIdeaButton"),
    relationState: $("#relationState"),
    relationProposal: $("#relationProposal"),
    confirmRelation: $("#confirmRelation"),
    voiceButton: $("#voiceButton"),
    voiceStopButton: $("#voiceStopButton"),
    replayButton: $("#replayButton"),
    voiceStatus: $("#voiceStatus"),
    transcriptLive: $("#transcriptLive"),
    voiceTimer: $("#voiceTimer"),
    voiceSnapshot: $("#voiceSnapshot"),
    footnotePopover: $("#footnotePopover"),
    evidenceDrawer: $("#evidenceDrawer"),
    evidenceFrame: $("#evidenceFrame"),
    drawerLabel: $("#drawerLabel"),
    causalLines: $("#causalLines")
  };

  const clone = value => JSON.parse(JSON.stringify(value));

  function sourceInfo(sourceKey = state.activeSource) {
    return SOURCES[sourceKey] || null;
  }

  function sourceSnapshot(sourceKey = state.activeSource) {
    const source = sourceInfo(sourceKey);
    if (!source) return null;
    const startedAt = Date.now();
    return {
      sourceKey: source.key,
      source_id: source.source_id,
      source_locator: source.source_locator,
      book_revision: BOOK_REVISION,
      page: source.pdf_page,
      print_page: source.print_page,
      snapshotId: `${source.source_id}:${startedAt}`,
      anchorId: `source-${source.key}`,
      startedAt
    };
  }

  function setVoiceStatus(message) {
    if (node.voiceStatus) node.voiceStatus.textContent = message;
  }

  function setActiveSource(sourceKey, options = {}) {
    if (!sourceInfo(sourceKey)) return false;
    state.activeSource = sourceKey;
    $$('[data-source-select]').forEach(button => button.classList.toggle("is-active", button.dataset.sourceSelect === sourceKey));
    $$('[data-source-key]').forEach(block => block.classList.toggle("is-current", block.dataset.sourceKey === sourceKey));
    if (!options.silent) {
      setVoiceStatus(`当前原文：PDF ${sourceInfo(sourceKey).pdf_page}；可以开始这一轮。`);
    }
    updateCausalLines();
    return true;
  }

  function sourceAnchorFor(sourceKey) {
    return $(`[data-source-key="${sourceKey}"]`);
  }

  function rememberSourceViewport(sourceKey) {
    const target = sourceAnchorFor(sourceKey);
    if (!target) return null;
    const rect = target.getBoundingClientRect();
    return { sourceKey, top: rect.top, left: rect.left, height: rect.height };
  }

  function restoreSourceViewport(anchor) {
    if (!anchor) return;
    const target = sourceAnchorFor(anchor.sourceKey);
    if (!target) return;
    const delta = target.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
    target.focus({ preventScroll: true });
  }

  function ideaSourceId(idea) {
    return idea && idea.source_id ? idea.source_id : "source_unavailable";
  }

  function renderIdeas() {
    if (!node.ideaList) return;
    if (!state.ideas.length) {
      node.ideaList.innerHTML = '<p class="rail-empty">Replay 两个锚点，Ideas 会贴回原文。</p>';
      return;
    }
    node.ideaList.innerHTML = state.ideas.map((idea, index) => {
      const source = sourceInfo(idea.sourceKey);
      const status = idea.status === "committed" ? "已确认" : "待确认";
      const revision = `rev ${idea.revision}`;
      return `<article class="idea-item" data-idea-id="${idea.turn_id}"><strong>${index + 1} · ${status}</strong><small>${source ? source.source_locator : ideaSourceId(idea)} · ${revision}</small><p>${escapeHtml(idea.text)}</p><em>↪ 绑定 ${source ? `PDF ${source.pdf_page}` : "未绑定原文"}</em></article>`;
    }).join("");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function relationFromIdeas() {
    const source_ids = Array.from(new Set(state.ideas.map(idea => idea.source_id).filter(Boolean)));
    const evidence_refs = state.ideas.flatMap(idea => idea.evidence_refs || []);
    state.relation.source_ids = source_ids;
    state.relation.evidence_refs = Array.from(new Set(evidence_refs));
    if (source_ids.length < 2) {
      state.relation.status = "draft";
      state.relation.stale = false;
    } else if (state.relation.status !== "committed") {
      state.relation.status = "needs_review";
      state.relation.stale = false;
    }
  }

  function markRelationStale() {
    if (state.relation.status === "committed" || state.world.phase !== "closed") {
      state.relation.status = "needs_review";
      state.relation.stale = true;
      state.relation.graph_revision += 1;
      state.world.phase = "closed";
      state.world.revision += 1;
      state.world.events = [];
      state.world.anchor = null;
      renderWorld();
    }
  }

  function addIdea(text, sourceKey = state.activeSource, options = {}) {
    const clean = String(text || "").trim();
    const source = sourceInfo(sourceKey);
    if (!clean || !source) return { ok: false, code: "EMPTY_OR_SOURCE_UNAVAILABLE" };
    const snapshot = options.snapshot || sourceSnapshot(sourceKey);
    const existing = state.ideas.find(idea => idea.sourceKey === sourceKey && idea.text === clean);
    if (existing) return { ok: true, idea: clone(existing), duplicate: true };
    const sameSource = state.ideas.find(idea => idea.sourceKey === sourceKey);
    const revisionHistory = sameSource ? (sameSource.revision_history || []).concat({ revision: sameSource.revision, text: sameSource.text, savedAt: sameSource.savedAt }) : [];
    const idea = {
      turn_id: `turn-${Date.now()}-${state.ideas.length + 1}`,
      sourceKey,
      source_id: source.source_id,
      source_anchor: snapshot ? snapshot.snapshotId : source.source_locator,
      evidence_refs: [`${source.source_id}#pdf-${source.pdf_page}`],
      confidence: Number.isFinite(options.confidence) ? options.confidence : 1,
      status: "needs_review",
      revision: sameSource ? sameSource.revision + 1 : 1,
      revision_history: revisionHistory,
      text: clean,
      origin: options.origin || "text",
      savedAt: new Date().toISOString()
    };
    if (sameSource) {
      const index = state.ideas.indexOf(sameSource);
      state.ideas[index] = idea;
      markRelationStale();
    } else {
      state.ideas.push(idea);
    }
    relationFromIdeas();
    renderIdeas();
    renderRelation();
    return { ok: true, idea: clone(idea) };
  }

  function renderRelation() {
    const count = state.ideas.length;
    const hasPair = state.relation.source_ids.length >= 2;
    const committed = state.relation.status === "committed" && !state.relation.stale;
    if (node.relationState) {
      node.relationState.textContent = committed ? "已确认 · Gate 通过" : state.relation.stale ? "原文更新后需重新确认" : hasPair ? "两条 Idea 已接通，等待确认" : `已保存 ${count}/2 条 Idea`;
    }
    if (node.confirmRelation) {
      node.confirmRelation.disabled = !hasPair || committed;
      node.confirmRelation.textContent = committed ? "关系已确认" : "确认这条关系";
    }
    node.relationProposal?.classList.toggle("is-confirmed", committed);
  }

  function restoreRailScroll() {
    if (node.rail) node.rail.scrollTop = 0;
  }

  function renderVoice() {
    const snapshot = state.voice.snapshot;
    if (node.voiceSnapshot) node.voiceSnapshot.textContent = snapshot ? `${snapshot.source_locator} · PDF ${snapshot.page} · ${snapshot.snapshotId.split(":").pop()}` : "—";
    if (node.transcriptLive) node.transcriptLive.textContent = state.voice.transcript || "尚未有最终转写";
    if (node.voiceButton) node.voiceButton.classList.toggle("is-recording", state.voice.recording);
    if (node.voiceStopButton) node.voiceStopButton.disabled = !state.voice.recording && !state.voice.requesting;
    if (node.voiceButton) node.voiceButton.setAttribute("aria-label", state.voice.recording ? "停止并提交这一轮" : "开始语音");
  }

  function renderWorld() {
    if (!node.worldSlot) return;
    const world = state.world;
    node.worldSlot.hidden = world.phase === "closed";
    node.worldSlot.dataset.state = world.phase;
    node.worldSlot.setAttribute("aria-busy", world.phase === "loading" ? "true" : "false");
    if (node.worldPhase) node.worldPhase.textContent = world.phase === "open" ? "世界运行" : world.phase === "loading" ? "世界加载" : "世界关闭";
    if (node.worldAnchorLabel) node.worldAnchorLabel.textContent = `触发原文：${world.anchor?.source_locator || sourceInfo(world.triggerSource).source_locator}`;
    if (node.metricOutput) node.metricOutput.textContent = world.output;
    if (node.metricStock) node.metricStock.textContent = world.stock;
    if (node.metricOrders) node.metricOrders.textContent = world.orders;
    if (node.metricCash) node.metricCash.textContent = world.cash;
    if (node.metricMarket) node.metricMarket.textContent = world.market;
    if (node.eventCount) node.eventCount.textContent = `${world.events.length} 条`;
    if (node.eventList) {
      node.eventList.innerHTML = world.events.length ? world.events.map(event => `<li><span>${escapeHtml(event.roleLabel)} · ${escapeHtml(event.kind)}</span><strong>${escapeHtml(event.line)}</strong><small>${escapeHtml(event.detail)}</small></li>`).join("") : '<li class="log-empty">动作发生后，角色局部状态会按因果顺序写入这里。</li>';
    }
    $$('.role-figure').forEach(figure => {
      figure.classList.toggle("is-active", world.events.length && figure.dataset.role === world.events[world.events.length - 1]?.role);
    });
  }

  function renderLoading(step, copy) {
    if (node.loadingTitle) node.loadingTitle.textContent = step >= 3 ? "舞台已锁定，正在开场…" : "正在把两条原文接通…";
    if (node.loadingCopy) node.loadingCopy.textContent = copy;
    if (node.loadingProgress) node.loadingProgress.style.width = `${Math.min(100, Math.max(8, step * 33))}%`;
    $$('[data-step]', node.worldLoading).forEach(item => item.classList.toggle("is-done", Number(item.dataset.step) <= step));
  }

  function beginWorldLoading() {
    if (state.relation.status !== "committed" || state.relation.stale || state.relation.source_ids.length < 2) return { ok: false, code: "RELATION_GATE_CLOSED" };
    const anchor = rememberSourceViewport(state.activeSource);
    const source = sourceInfo(state.activeSource);
    state.world = { ...state.world, phase: "loading", revision: state.world.revision + 1, triggerSource: state.activeSource, anchor: { ...sourceSnapshot(state.activeSource), ...anchor }, events: [] };
    renderWorld();
    renderLoading(0, "先把证据、关系和舞台位置固定下来。");
    const steps = [
      [1, "两条原文已对齐；关系证据仍绑定各自 source_id。"],
      [2, "市场范围关系通过；世界动作只能走确定性 allowlist。"],
      [3, "固定高度舞台准备完成；内部事件不会推开正文。"]
    ];
    let index = 0;
    const timer = window.setInterval(() => {
      const [step, copy] = steps[index++];
      renderLoading(step, copy);
      if (index >= steps.length) {
        window.clearInterval(timer);
        window.setTimeout(() => openWorld(), 260);
      }
    }, 300);
    return { ok: true, code: "WORLD_LOADING", source: source.source_id };
  }

  function openWorld() {
    if (state.world.phase !== "loading") return { ok: false, code: "WORLD_NOT_LOADING" };
    state.world.phase = "open";
    state.world.revision += 1;
    renderWorld();
    window.requestAnimationFrame(() => restoreSourceViewport(state.world.anchor));
    return { ok: true, code: "WORLD_OPEN" };
  }

  function collapseWorld() {
    const anchor = state.world.anchor;
    state.world.phase = "closed";
    state.world.revision += 1;
    state.world.events = [];
    renderWorld();
    window.requestAnimationFrame(() => restoreSourceViewport(anchor));
    return { ok: true, code: "WORLD_CLOSED" };
  }

  function appendEvent(role, kind, line, detail) {
    const labels = { merchant: "商人", shepherd: "牧羊人", spinner: "纺纱工", weaver: "织工" };
    state.world.events.push({ role, roleLabel: labels[role] || role, kind, line, detail, revision: state.world.revision });
  }

  function runWorldAction(action) {
    if (state.world.phase !== "open") return { ok: false, code: "WORLD_NOT_OPEN", numeric_changed: false };
    if (action === "specialize") {
      appendEvent("weaver", "织工拒绝", "织工：先别把我锁进更窄的一道工序。", "小市场仍只有 2 个开放订单；专业化请求被拒绝，数值保持不变。" );
      renderWorld();
      return { ok: true, code: "CHARACTER_REFUSAL", numeric_changed: false, before: { output: state.world.output, stock: state.world.stock, orders: state.world.orders, cash: state.world.cash } };
    }
    if (action === "expand") {
      state.world.output = 17;
      state.world.stock = 11;
      state.world.orders = 4;
      state.world.cash = 28;
      state.world.market = "跨城市场";
      state.world.revision += 1;
      appendEvent("merchant", "道路开通", "商人：隔壁城愿意接下第一批粗呢。", "市场范围扩大；订单开始流入。" );
      appendEvent("shepherd", "原料响应", "牧羊人：羊毛可以按新的节奏送到镇上。", "原料供给跟随订单增长。" );
      appendEvent("spinner", "纺纱响应", "纺纱工：我会先把纱线批次分开，别让织机等料。", "中间工序按 merchant → shepherd → spinner → weaver 顺序响应。" );
      appendEvent("weaver", "织机加速", "织工：现在值得把动作拆得更细了。", "订单增加后，专业化的收益足以覆盖切换损耗。" );
      renderWorld();
      return { ok: true, code: "WORLD_EVENT_RECORDED", numeric_changed: true, role_order: ROLE_ORDER.slice() };
    }
    return { ok: false, code: "ACTION_NOT_ALLOWLISTED", numeric_changed: false };
  }

  function updateTimer() {
    if (!node.voiceTimer) return;
    const elapsed = state.voice.recording && state.voice.startedAt ? Math.floor((Date.now() - state.voice.startedAt) / 1000) : 0;
    node.voiceTimer.textContent = `00:${String(elapsed).padStart(2, "0")}`;
    if (state.voice.recording) state.voice.timer = window.setTimeout(updateTimer, 500);
  }

  function resetVoice(reason = "可以开始这一轮；不会后台监听。") {
    if (state.voice.timer) window.clearTimeout(state.voice.timer);
    state.voice.timer = null;
    state.voice.recording = false;
    state.voice.requesting = false;
    state.voice.recognition = null;
    state.voice.startedAt = 0;
    setVoiceStatus(reason);
    renderVoice();
  }

  function commitVoiceTranscript(text, snapshot = state.voice.snapshot) {
    const clean = String(text || "").trim();
    if (!clean || !snapshot || !SOURCES[snapshot.sourceKey]) return { ok: false, code: "VOICE_SOURCE_UNAVAILABLE" };
    state.voice.transcript = clean;
    const result = addIdea(clean, snapshot.sourceKey, { origin: "voice", snapshot, confidence: 1 });
    renderVoice();
    return result;
  }

  function startVoice() {
    if (state.voice.recording || state.voice.requesting) return { ok: false, code: "VOICE_ALREADY_STARTING" };
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("当前浏览器不支持实时语音；可以用 Replay 或文字保存 Idea。");
      return { ok: false, code: "VOICE_UNSUPPORTED" };
    }
    const snapshot = sourceSnapshot(state.activeSource);
    if (!snapshot) {
      setVoiceStatus("当前原文不可用，已阻止开始语音。");
      return { ok: false, code: "VOICE_SOURCE_UNAVAILABLE" };
    }
    state.voice.requesting = true;
    state.voice.snapshot = snapshot;
    state.voice.generation += 1;
    const generation = state.voice.generation;
    const recognition = new SpeechRecognition();
    state.voice.recognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      if (generation !== state.voice.generation) return;
      state.voice.requesting = false;
      state.voice.recording = true;
      state.voice.startedAt = Date.now();
      setVoiceStatus(`正在听；已冻结 ${snapshot.source_locator}，切换原文也不会漂移。`);
      renderVoice();
      updateTimer();
    };
    recognition.onresult = event => {
      if (generation !== state.voice.generation) return;
      let interim = "";
      let finalText = "";
      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript || "";
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      if (interim && node.transcriptLive) node.transcriptLive.textContent = interim;
      if (finalText) commitVoiceTranscript(finalText, snapshot);
    };
    recognition.onerror = event => {
      if (generation !== state.voice.generation) return;
      const message = event.error === "not-allowed" || event.error === "service-not-allowed" ? "麦克风权限被拒绝；可以改用 Replay。" : `语音暂不可用（${event.error || "unknown"}）；这一轮没有提交。`;
      state.voice.generation += 1;
      resetVoice(message);
    };
    recognition.onend = () => {
      if (generation !== state.voice.generation) return;
      resetVoice(state.voice.transcript ? "这一轮已提交；需要时可以 Replay。" : "这一轮没有最终转写；可以再试一次。" );
    };
    try {
      recognition.start();
      renderVoice();
      return { ok: true, code: "VOICE_REQUESTED", snapshot: clone(snapshot) };
    } catch (error) {
      state.voice.generation += 1;
      resetVoice("语音启动失败；可以改用 Replay。");
      return { ok: false, code: "VOICE_START_FAILED", error: String(error) };
    }
  }

  function stopVoice() {
    if (!state.voice.recognition) return { ok: false, code: "VOICE_NOT_ACTIVE" };
    state.voice.generation += 1;
    try { state.voice.recognition.stop(); } catch (_) { /* no-op */ }
    resetVoice("语音已停止；这一轮只使用开始时冻结的原文。");
    return { ok: true, code: "VOICE_STOPPED" };
  }

  function replayVoice(sourceKey = state.activeSource) {
    const source = sourceInfo(sourceKey);
    if (!source) return { ok: false, code: "REPLAY_SOURCE_UNAVAILABLE" };
    const snapshot = sourceSnapshot(sourceKey);
    state.voice.snapshot = snapshot;
    state.voice.transcript = source.replay;
    setActiveSource(sourceKey, { silent: true });
    setVoiceStatus(`Replay 已绑定 ${source.source_locator}；不是实时麦克风。`);
    const result = addIdea(source.replay, sourceKey, { origin: "replay", snapshot, confidence: 1 });
    renderVoice();
    return { ...result, code: "REPLAY_COMMITTED", snapshot: clone(snapshot) };
  }

  function openEvidence() {
    const source = sourceInfo(state.activeSource);
    if (!source || !node.evidenceDrawer || !node.evidenceFrame) return false;
    node.drawerLabel.textContent = `当前原文：${source.source_locator} · PDF ${source.pdf_page} / print p. ${source.print_page}`;
    node.evidenceFrame.src = `${PDF_URL}#page=${source.pdf_page}`;
    node.evidenceDrawer.hidden = false;
    return true;
  }

  function updateCausalLines() {
    if (!node.causalLines || !node.shell) return;
    const shellRect = node.shell.getBoundingClientRect();
    $$('[data-line]', node.causalLines).forEach(line => {
      const sourceKey = line.dataset.line;
      const anchor = $(`[data-source-select="${sourceKey}"]`);
      const source = sourceAnchorFor(sourceKey);
      if (!anchor || !source) return;
      const a = anchor.getBoundingClientRect();
      const b = source.getBoundingClientRect();
      const left = Math.max(0, a.right - shellRect.left - 2);
      const top = a.top - shellRect.top + a.height / 2;
      const width = Math.max(30, b.left - a.right + 4);
      const height = Math.max(2, b.top - a.top + b.height / 2 - a.height / 2);
      line.style.left = `${left}px`;
      line.style.top = `${top}px`;
      line.style.width = `${width}px`;
      line.style.height = `${height}px`;
    });
  }

  function getState() {
    return clone(state);
  }

  function bind() {
    $$('[data-source-select]').forEach(button => button.addEventListener("click", () => setActiveSource(button.dataset.sourceSelect)));
    $$('[data-source-focus]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      setActiveSource(button.dataset.sourceFocus);
      sourceAnchorFor(button.dataset.sourceFocus)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
    $$('[data-replay-source]').forEach(button => button.addEventListener("click", () => replayVoice(button.dataset.replaySource)));
    node.replayButton?.addEventListener("click", () => replayVoice(state.activeSource));
    node.voiceButton?.addEventListener("click", () => state.voice.recording || state.voice.requesting ? stopVoice() : startVoice());
    node.voiceStopButton?.addEventListener("click", stopVoice);
    node.saveIdeaButton?.addEventListener("click", () => {
      const result = addIdea(node.ideaInput?.value || "", state.activeSource, { origin: "text" });
      if (result.ok && node.ideaInput) node.ideaInput.value = "";
      setVoiceStatus(result.ok ? "想法已保存，并绑定到当前原文。" : "需要一句文字，且当前原文必须可用。" );
    });
    node.confirmRelation?.addEventListener("click", () => {
      if (state.relation.source_ids.length < 2) return;
      state.relation.status = "committed";
      state.relation.stale = false;
      state.ideas.forEach(idea => { idea.status = "committed"; });
      renderIdeas();
      renderRelation();
      beginWorldLoading();
      // The confirm control lives at the bottom of the fixed rail. Chromium
      // may scroll that rail to keep the focused button visible; return it to
      // the reference composition so the brand/anchors remain in view while
      // the paper world loads.
      restoreRailScroll();
      window.requestAnimationFrame(restoreRailScroll);
      window.setTimeout(restoreRailScroll, 60);
    });
    $$('[data-world-action]').forEach(button => button.addEventListener("click", () => runWorldAction(button.dataset.worldAction)));
    $("#collapseWorld")?.addEventListener("click", collapseWorld);
    $("#openEvidenceButton")?.addEventListener("click", openEvidence);
    $$('[data-close-evidence]').forEach(button => button.addEventListener("click", () => { if (node.evidenceDrawer) node.evidenceDrawer.hidden = true; }));
    $$('[data-footnote]').forEach(button => button.addEventListener("click", () => { if (node.footnotePopover) node.footnotePopover.hidden = false; }));
    $$('[data-close-footnote]').forEach(button => button.addEventListener("click", () => { if (node.footnotePopover) node.footnotePopover.hidden = true; }));
    window.addEventListener("resize", updateCausalLines);
    window.addEventListener("scroll", updateCausalLines, { passive: true });
  }

  function init() {
    bind();
    setActiveSource("division", { silent: true });
    renderIdeas();
    renderRelation();
    renderVoice();
    renderWorld();
    updateCausalLines();
  }

  window.__livingReaderReference = {
    state,
    sources: SOURCES,
    setActiveSource,
    sourceSnapshot,
    addIdea,
    replayVoice,
    startVoice,
    stopVoice,
    confirmRelation: () => node.confirmRelation?.click(),
    beginWorldLoading,
    openWorld,
    collapseWorld,
    runWorldAction,
    openEvidence,
    getState,
    updateCausalLines
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
