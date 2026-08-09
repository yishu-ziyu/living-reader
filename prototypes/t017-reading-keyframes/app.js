// PROTOTYPE ONLY — no persistence, no product mutations.
const variants = ["A", "B"];
const names = {
  A: "A · 安静轨道 / 移动底部层",
  B: "B · 书签召回 / 移动侧抽屉",
};

function mountTemplates() {
  document.querySelectorAll("SourceHeader").forEach((host) => {
    const node = document.querySelector("#sourceHeaderTemplate").content.cloneNode(true);
    node.querySelector(".source-page").textContent = `PDF ${host.dataset.page}`;
    node.querySelector(".source-chapter").textContent = host.dataset.chapter;
    host.replaceWith(node);
  });
  document.querySelectorAll("Composer").forEach((host) => {
    const node = document.querySelector("#composerTemplate").content.cloneNode(true);
    node.querySelector("input").placeholder = host.getAttribute("label") || "说点什么…";
    node.querySelector(".composer-block").dataset.source = host.closest("section")?.id || "source";
    host.replaceWith(node);
  });
  document.querySelectorAll("RelationPanel").forEach((host) => {
    const node = document.querySelector("#relationTemplate").content.cloneNode(true);
    const panel = node.querySelector(".relation-panel");
    panel.id = host.dataset.id;
    const world = node.querySelector(".world-reveal");
    world.dataset.worldFor = host.dataset.id;
    host.replaceWith(node);
  });
}

function variantFromUrl() {
  const value = new URLSearchParams(location.search).get("variant")?.toUpperCase();
  return variants.includes(value) ? value : "A";
}

let currentVariant = variantFromUrl();
let drawerReturnFocus = null;
let sheetReturnFocus = null;

function setVariant(next, { updateUrl = true } = {}) {
  currentVariant = variants.includes(next) ? next : "A";
  document.body.dataset.variant = currentVariant;
  document.querySelectorAll("[data-variant-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.variantPanel !== currentVariant;
  });
  document.querySelectorAll("[data-variant]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.variant === currentVariant));
  });
  document.querySelector("[data-variant-name]").textContent = names[currentVariant];
  closeDrawer({ restoreFocus: false });
  closeMobileSheet({ restoreFocus: false });
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("variant", currentVariant);
    history.replaceState({}, "", url);
  }
}

function cycleVariant(direction) {
  const index = variants.indexOf(currentVariant);
  setVariant(variants[(index + direction + variants.length) % variants.length]);
}

function openDrawer() {
  const drawer = document.querySelector("#agentDrawer");
  const scrim = document.querySelector(".drawer-scrim");
  const bookmark = document.querySelector(".agent-bookmark");
  drawerReturnFocus = document.activeElement;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  bookmark.setAttribute("aria-expanded", "true");
  scrim.hidden = false;
  drawer.querySelector("[data-drawer-close]").focus();
}

function closeDrawer({ restoreFocus = true } = {}) {
  const drawer = document.querySelector("#agentDrawer");
  const scrim = document.querySelector(".drawer-scrim");
  const bookmark = document.querySelector(".agent-bookmark");
  if (!drawer) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  bookmark.setAttribute("aria-expanded", "false");
  scrim.hidden = true;
  if (restoreFocus && drawerReturnFocus instanceof HTMLElement) drawerReturnFocus.focus();
}

function openMobileSheet() {
  const sheet = document.querySelector("#mobileAgentSheetA");
  const scrim = document.querySelector(".mobile-sheet-scrim");
  const trigger = document.querySelector(".mobile-agent-trigger");
  sheetReturnFocus = document.activeElement;
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");
  scrim.hidden = false;
  sheet.querySelector("[data-mobile-sheet-close]").focus();
}

function closeMobileSheet({ restoreFocus = true } = {}) {
  const sheet = document.querySelector("#mobileAgentSheetA");
  const scrim = document.querySelector(".mobile-sheet-scrim");
  const trigger = document.querySelector(".mobile-agent-trigger");
  if (!sheet) return;
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
  trigger.setAttribute("aria-expanded", "false");
  scrim.hidden = true;
  if (restoreFocus && sheetReturnFocus instanceof HTMLElement) sheetReturnFocus.focus();
}

function submitExpression(form) {
  const block = form.closest(".composer-block");
  const input = form.querySelector("input");
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }
  const confirm = block.querySelector(".intent-confirm");
  confirm.querySelector("[data-intent-preview]").textContent = `“${text}”`;
  confirm.hidden = false;
  input.setAttribute("aria-describedby", "intent-confirmation");
}

function setIntent(button) {
  const confirm = button.closest(".intent-confirm");
  confirm.querySelectorAll("[data-intent]").forEach((option) => {
    option.setAttribute("aria-pressed", String(option === button));
  });
  confirm.querySelector("span").textContent = `已按“${button.dataset.intent}”保存，可随时修改`;
}

function commitRelation(button) {
  const panel = button.closest(".relation-panel");
  const world = panel.nextElementSibling;
  panel.classList.add("is-committed");
  panel.querySelector(".relation-kicker > span").textContent = "关系已经由你确认";
  panel.querySelector(".relation-kicker small").textContent = "世界规则可以预览";
  button.textContent = "已接通 · 可撤回";
  world.hidden = false;
  requestAnimationFrame(() => {
    world.classList.add("is-open");
    setTimeout(() => world.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  });
}

function toggleEvidence(button) {
  const header = button.closest(".source-header");
  const source = header?.parentElement;
  if (!source) return;
  let evidence = source.querySelector(":scope > .source-evidence-inline");
  if (!evidence) {
    evidence = document.createElement("p");
    evidence.className = "source-evidence-inline plain-note";
    const page = header.querySelector(".source-page").textContent;
    evidence.textContent = `${page} · OLL Cannan 1904 · 稳定来源已核验；工程 ID 在正式产品中只按需展开。`;
    header.insertAdjacentElement("afterend", evidence);
    button.textContent = "收起依据";
  } else {
    evidence.remove();
    button.textContent = "查看依据";
  }
}

mountTemplates();
setVariant(currentVariant, { updateUrl: false });

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, [data-drawer-close]");
  if (!target) return;
  if (target.matches("[data-variant]")) setVariant(target.dataset.variant);
  if (target.matches("[data-cycle]")) cycleVariant(Number(target.dataset.cycle));
  if (target.matches("[data-scroll-to]")) document.getElementById(target.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (target.matches(".agent-bookmark")) openDrawer();
  if (target.matches("[data-drawer-close]")) closeDrawer();
  if (target.matches(".mobile-agent-trigger")) openMobileSheet();
  if (target.matches("[data-mobile-sheet-close]")) closeMobileSheet();
  if (target.matches("[data-mobile-sheet-jump]")) {
    closeMobileSheet();
    document.querySelector("#relation-a")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (target.matches("[data-drawer-jump]")) {
    closeDrawer();
    document.querySelector("#relation-b")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (target.matches("[data-inline-toggle]")) {
    const panel = document.querySelector("[data-inline-companion]");
    panel.hidden = !panel.hidden;
    target.firstChild.textContent = panel.hidden ? "召回陪读 " : "收起陪读 ";
  }
  if (target.matches(".source-evidence")) toggleEvidence(target);
  if (target.matches("[data-intent]")) setIntent(target);
  if (target.matches(".intent-cancel")) {
    const block = target.closest(".composer-block");
    block.querySelector(".intent-confirm").hidden = true;
    block.querySelector("input").value = "";
    block.querySelector("input").focus();
  }
  if (target.matches(".composer-mic")) {
    const listening = target.classList.toggle("is-listening");
    target.textContent = listening ? "停止" : "语音";
    target.setAttribute("aria-pressed", String(listening));
  }
  if (target.matches("[data-relation-accept]")) commitRelation(target);
  if (target.matches("[data-relation-adjust]")) {
    target.closest(".relation-panel").querySelector(".relation-explain").textContent = "调整模式：先改成人话，再重新确认；两段原文保持在当前位置。";
  }
  if (target.matches("[data-relation-hold]")) {
    target.closest(".relation-panel").querySelector(".relation-kicker small").textContent = "已暂缓 · 阅读位置不变";
  }
  if (target.matches("[data-world-enter]")) {
    target.textContent = "规则已展开 · 再次点击可进入";
  }
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches(".single-composer")) return;
  event.preventDefault();
  submitExpression(event.target);
});

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;
  if (event.key === "Escape") {
    closeDrawer();
    closeMobileSheet();
  }
  if (event.key === "ArrowLeft") cycleVariant(-1);
  if (event.key === "ArrowRight") cycleVariant(1);
});

window.addEventListener("popstate", () => setVariant(variantFromUrl(), { updateUrl: false }));

window.__t017Prototype = {
  get variant() { return currentVariant; },
  setVariant,
  openDrawer,
  closeDrawer,
  openMobileSheet,
  closeMobileSheet,
};
