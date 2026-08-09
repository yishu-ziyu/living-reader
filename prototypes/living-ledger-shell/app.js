(() => {
  const STATES = ["reader", "world", "evidence"];
  const labels = {
    reader: { number: "01", label: "原文与实验", folio: "SOURCE GRAPH / READER'S PREDICTION" },
    world: { number: "02", label: "世界运行中", folio: "EXECUTABLE PLATE / MODEL EXTENSION" },
    evidence: { number: "03", label: "同段证据", folio: "EVIDENCE / SOURCE GRAPH RETURN" },
  };

  const SOURCE_NODES = [
    { id: "smith.b1.c1.division", label: "专业化", elementId: "source-node-division" },
    { id: "smith.b1.c3.market_extent", label: "市场范围约束", elementId: "source-node-market-extent" },
    { id: "smith.b1.c2.exchange", label: "交换规则", elementId: "source-node-exchange" },
  ];

  const EDGE_DEFS = [
    {
      from: "smith.b1.c1.division",
      to: "smith.b1.c3.market_extent",
      type: "constrained_by",
      label: "专业化 -- constrained_by --> 市场范围约束",
    },
    {
      from: "smith.b1.c2.exchange",
      to: "smith.b1.c1.division",
      type: "exchange_rule",
      label: "交换规则 -- exchange_rule --> 专业化",
    },
  ];

  const body = document.body;
  const statusNumber = document.querySelector(".status-number");
  const statusLabel = document.querySelector("#statusLabel");
  const folioState = document.querySelector("#folioState");
  const iframe = document.querySelector("#worldIframe");
  const prediction = document.querySelector("#prediction");
  const predictionEcho = document.querySelector("#predictionEcho");
  const openWorld = document.querySelector("#openWorld");
  const sourceNodes = SOURCE_NODES.map((node) => ({
    ...node,
    element: document.querySelector(`#${node.elementId}`),
  }));
  let activeNodeIds = [];
  let iframeLoaded = false;
  let worldLoadTimer = null;

  const requestedState = new URLSearchParams(window.location.search).get("state");
  let currentState = STATES.includes(requestedState) ? requestedState : "reader";

  function ensureWorldLoaded() {
    if (iframeLoaded) return;
    iframe.src = iframe.dataset.src;
    iframeLoaded = true;
  }

  function queueWorldLoad() {
    if (iframeLoaded || worldLoadTimer) return;
    worldLoadTimer = window.setTimeout(() => {
      worldLoadTimer = null;
      if (currentState !== "reader") ensureWorldLoaded();
    }, 260);
  }

  function syncPrediction() {
    const value = prediction.value.trim();
    predictionEcho.textContent = value || "尚未留下判断。";
  }

  function activeNodes() {
    return SOURCE_NODES.filter((node) => activeNodeIds.includes(node.id));
  }

  function activeEdges() {
    return EDGE_DEFS.filter((edge) => activeNodeIds.includes(edge.from) && activeNodeIds.includes(edge.to));
  }

  function graphCountLabel(nodes, edges) {
    return `${nodes} NODE${nodes === 1 ? "" : "S"} · ${edges} EDGE${edges === 1 ? "" : "S"}`;
  }

  function graphSeedLabel(nodes) {
    if (!nodes.length) return "等待第一段原文";
    return nodes.map((node) => node.label).join(" + ");
  }

  function graphEdgesLabel(edges) {
    return edges.length ? edges.map((edge) => edge.label).join(" · ") : "关系线将在第二个节点激活后出现。";
  }

  function displayNodeId(node) {
    return `${node.id} · ${node.label}`.replaceAll(".", ".\u200b").replaceAll("_", "_\u200b");
  }

  function renderGraph() {
    const nodes = activeNodes();
    const edges = activeEdges();
    const count = graphCountLabel(nodes.length, edges.length);
    const ids = nodes.length ? nodes.map((node) => node.id).join(" · ") : "尚未激活阅读节点。";
    const edgeText = graphEdgesLabel(edges);
    const seed = graphSeedLabel(nodes);

    sourceNodes.forEach(({ element, id }) => {
      if (!element) return;
      const isActive = activeNodeIds.includes(id);
      element.classList.toggle("is-active", isActive);
      element.setAttribute("aria-pressed", String(isActive));
      const state = element.querySelector(".source-node__state");
      if (state) state.textContent = isActive ? "●" : "○";
    });

    document.querySelector("#activeGraphCount").textContent = count;
    document.querySelector("#activeNodeIds").textContent = ids;
    document.querySelector("#activeGraphEdges").textContent = edgeText;
    document.querySelector("#slipGraphCount").textContent = count;
    document.querySelector("#slipGraphSeed strong").textContent = seed;
    document.querySelector("#slipActiveNodes").textContent = `ACTIVE SOURCE IDS · ${nodes.length ? nodes.map((node) => node.id).join(" · ") : "—"}`;
    document.querySelector("#slipHint").textContent = nodes.length >= 2 ? "关系已成形，可以运行这组关系。" : "至少激活 2 个节点后可运行。";
    openWorld.disabled = nodes.length < 2;

    document.querySelector("#worldActiveGraphCount").textContent = count;
    document.querySelector("#worldActiveNodeIds").textContent = nodes.length ? nodes.map(displayNodeId).join("\n") : "—";
    document.querySelector("#worldActiveEdges").textContent = edges.length ? edges.map((edge) => edge.label).join("\n") : "—";

    document.querySelector("#evidenceSourceIds").textContent = nodes.length ? nodes.map((node) => node.id).join(" · ") : "—";
    document.querySelector("#evidenceGraphCount").textContent = count;
    document.querySelector("#evidenceGraphEdges").textContent = edges.length ? edges.map((edge) => edge.label).join("\n") : "尚未生成关系。";
  }

  function setState(nextState, { updateUrl = true } = {}) {
    if (!STATES.includes(nextState)) return;
    currentState = nextState;
    body.dataset.state = nextState;

    if (nextState !== "reader") queueWorldLoad();
    if (nextState === "evidence") syncPrediction();

    const meta = labels[nextState];
    statusNumber.textContent = meta.number;
    statusLabel.textContent = meta.label;
    folioState.textContent = meta.folio;

    document.querySelectorAll("[data-target]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.target === nextState);
      if (button.classList.contains("ledger-tab")) {
        button.setAttribute("aria-current", button.dataset.target === nextState ? "step" : "false");
      }
    });

    renderGraph();

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("state", nextState);
      window.history.replaceState({}, "", url);
    }
  }

  function returnToSourceBlock() {
    setState("reader");
    const returnNode = sourceNodes.find(({ id }) => activeNodeIds.includes(id)) || sourceNodes[0];
    if (!returnNode?.element) return;
    returnNode.element.classList.remove("is-return-target");
    window.requestAnimationFrame(() => {
      returnNode.element.classList.add("is-return-target");
      returnNode.element.focus({ preventScroll: true });
    });
  }

  sourceNodes.forEach(({ element, id }) => {
    if (!element) return;
    element.addEventListener("click", () => {
      activeNodeIds = activeNodeIds.includes(id)
        ? activeNodeIds.filter((activeId) => activeId !== id)
        : [...activeNodeIds, id];
      renderGraph();
    });
  });

  openWorld.addEventListener("click", () => {
    if (activeNodeIds.length < 2) return;
    syncPrediction();
    setState("world");
  });

  document.querySelector("#closeWorld").addEventListener("click", () => {
    setState("evidence");
  });

  document.querySelector("#restart").addEventListener("click", returnToSourceBlock);

  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => setState(button.dataset.target));
  });

  window.addEventListener("keydown", (event) => {
    const active = document.activeElement;
    if (active && (active.matches("textarea, input") || active.isContentEditable)) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (STATES.indexOf(currentState) + direction + STATES.length) % STATES.length;
    setState(STATES[nextIndex]);
  });

  renderGraph();
  setState(currentState, { updateUrl: false });
})();
