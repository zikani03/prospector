/**
 * DevTools panel controller.
 * Manages UI state, communicates with the background service worker,
 * and renders scan results and consistency issues.
 */

const port = chrome.runtime.connect({ name: "prospector-panel" });
let snapshots = [];
let currentIssues = [];

// --- DOM refs ---
const btnScan = document.getElementById("btn-scan");
const btnCompare = document.getElementById("btn-compare");
const btnClear = document.getElementById("btn-clear");
const statusText = document.getElementById("status-text");
const summaryBar = document.getElementById("summary-bar");
const errorCount = document.getElementById("error-count");
const warningCount = document.getElementById("warning-count");
const infoCount = document.getElementById("info-count");
const pageCount = document.getElementById("page-count");

const issuesEmpty = document.getElementById("issues-empty");
const issuesList = document.getElementById("issues-list");
const pagesEmpty = document.getElementById("pages-empty");
const pagesList = document.getElementById("pages-list");
const elementsEmpty = document.getElementById("elements-empty");
const elementsList = document.getElementById("elements-list");

// --- Tab switching ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  });
});

// --- Actions ---
btnScan.addEventListener("click", () => {
  statusText.textContent = "Scanning…";
  btnScan.disabled = true;
  port.postMessage({ type: "SCAN_PAGE" });
});

btnCompare.addEventListener("click", () => {
  if (snapshots.length < 2) {
    statusText.textContent = "Need at least 2 pages to compare";
    return;
  }
  const crossIssues = Consistency.compareSnapshots(snapshots);
  currentIssues = [...currentIssues, ...crossIssues];
  renderIssues(currentIssues);
  statusText.textContent = `Compared ${snapshots.length} pages`;
});

btnClear.addEventListener("click", () => {
  snapshots = [];
  currentIssues = [];
  renderIssues([]);
  renderPages([]);
  renderElements(null);
  statusText.textContent = "Cleared";
  summaryBar.style.display = "none";
  try {
    port.postMessage({ type: "CLEAR_SNAPSHOTS" });
  } catch (e) {
    // Service worker may be inactive; local state is already cleared
  }
});

// --- Message handling ---
port.onMessage.addListener((message) => {
  switch (message.type) {
    case "SCAN_RESULT": {
      const snapshot = message.data;
      snapshots.push(snapshot);
      const pageIssues = Consistency.analyzePage(snapshot);
      currentIssues = [...currentIssues, ...pageIssues];
      renderIssues(currentIssues);
      renderPages(snapshots);
      renderElements(snapshot);
      updateSummary();
      statusText.textContent = `Scanned: ${new URL(snapshot.url).pathname}`;
      btnScan.disabled = false;
      break;
    }

    case "SCAN_ERROR":
      statusText.textContent = `Error: ${message.error}`;
      btnScan.disabled = false;
      break;

    case "SNAPSHOTS_LIST":
      snapshots = message.data;
      renderPages(snapshots);
      if (snapshots.length === 0) {
        currentIssues = [];
        renderIssues([]);
        renderElements(null);
        summaryBar.style.display = "none";
      }
      updateSummary();
      break;
  }
});

// Load existing snapshots on panel open
port.postMessage({ type: "GET_SNAPSHOTS" });

// --- Renderers ---

function renderIssues(issues) {
  if (issues.length === 0) {
    issuesEmpty.style.display = "flex";
    issuesList.innerHTML = "";
    return;
  }

  issuesEmpty.style.display = "none";

  // Group by category
  const groups = new Map();
  issues.forEach((issue) => {
    if (!groups.has(issue.category)) groups.set(issue.category, []);
    groups.get(issue.category).push(issue);
  });

  let html = "";
  groups.forEach((groupIssues, category) => {
    html += `
      <div class="issue-group">
        <div class="issue-group-header" onclick="this.classList.toggle('collapsed')">
          <span class="arrow">▼</span>
          ${escapeHtml(category)}
          <span class="count">${groupIssues.length}</span>
        </div>
        <ul class="issue-list">
    `;

    groupIssues.forEach((issue) => {
      const icon = issue.severity === "error" ? "●" : issue.severity === "warning" ? "▲" : "ℹ";
      html += `
        <li class="issue-item">
          <span class="issue-icon ${issue.severity}">${icon}</span>
          <span class="issue-message">
            ${escapeHtml(issue.message)}
            ${issue.detail ? `<div class="issue-detail">${escapeHtml(issue.detail)}</div>` : ""}
            ${issue.url ? `<div class="issue-detail">${escapeHtml(shortenUrl(issue.url))}</div>` : ""}
          </span>
        </li>
      `;
    });

    html += "</ul></div>";
  });

  issuesList.innerHTML = html;
  updateSummary();
}

function renderPages(pages) {
  if (pages.length === 0) {
    pagesEmpty.style.display = "flex";
    pagesList.innerHTML = "";
    return;
  }

  pagesEmpty.style.display = "none";

  let html = "";
  pages.forEach((snap, index) => {
    const time = new Date(snap.timestamp).toLocaleTimeString();
    const counts = Object.entries(snap.elements)
      .map(([cat, els]) => `${els.length} ${cat}`)
      .filter(([, els]) => true);

    html += `
      <div class="snapshot-item" onclick="showSnapshotElements(${index})">
        <span class="snapshot-url" title="${escapeHtml(snap.url)}">${escapeHtml(snap.title || snap.url)} <span style="color:var(--text-secondary)">${escapeHtml(getPathFragment(snap.url))}</span></span>
        <span class="snapshot-badges">
          ${snap.framework ? `<span class="badge" style="color:#89d185">${escapeHtml(snap.framework)}${snap.isSPA ? " (SPA)" : ""}</span>` : ""}
          ${Object.entries(snap.elements)
            .map(([cat, els]) => (els.length > 0 ? `<span class="badge">${els.length} ${cat}</span>` : ""))
            .join("")}
        </span>
        <span class="snapshot-time">${time}</span>
      </div>
    `;
  });

  pagesList.innerHTML = html;
}

// Expose to onclick
window.showSnapshotElements = function (index) {
  renderElements(snapshots[index]);
  // Switch to elements tab
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector('[data-tab="elements"]').classList.add("active");
  document.getElementById("tab-elements").classList.add("active");
};

function renderElements(snapshot) {
  if (!snapshot) {
    elementsEmpty.style.display = "flex";
    elementsList.innerHTML = "";
    return;
  }

  elementsEmpty.style.display = "none";

  let html = `<div style="padding: 4px 8px; color: var(--text-secondary); font-size: 11px; border-bottom: 1px solid var(--border);">
    ${escapeHtml(snapshot.title || snapshot.url)}
  </div>`;

  for (const [category, elements] of Object.entries(snapshot.elements)) {
    if (elements.length === 0) continue;

    html += `
      <div class="issue-group">
        <div class="issue-group-header" onclick="this.classList.toggle('collapsed')">
          <span class="arrow">▼</span>
          ${category.charAt(0).toUpperCase() + category.slice(1)}
          <span class="count">${elements.length}</span>
        </div>
        <table class="element-table">
          <tr>
            <th>Tag</th>
            <th>Text / Label</th>
            <th>Font Size</th>
            <th>Color</th>
            <th>Border Radius</th>
            <th>Size</th>
          </tr>
    `;

    elements.forEach((el) => {
      html += `
        <tr>
          <td>&lt;${escapeHtml(el.tag)}&gt;${el.id ? ` #${escapeHtml(el.id)}` : ""}</td>
          <td title="${escapeHtml(el.text)}">${escapeHtml(el.text.substring(0, 30)) || "—"}</td>
          <td>${escapeHtml(el.styles.fontSize)}</td>
          <td><span style="display:inline-block;width:10px;height:10px;background:${el.styles.color};border:1px solid #555;vertical-align:middle;margin-right:4px;"></span>${escapeHtml(el.styles.color)}</td>
          <td>${escapeHtml(el.styles.borderRadius)}</td>
          <td>${el.dimensions.width}×${el.dimensions.height}</td>
        </tr>
      `;
    });

    html += "</table></div>";
  }

  elementsList.innerHTML = html;
}

function updateSummary() {
  const errors = currentIssues.filter((i) => i.severity === "error").length;
  const warnings = currentIssues.filter((i) => i.severity === "warning").length;
  const infos = currentIssues.filter((i) => i.severity === "info").length;

  errorCount.textContent = errors;
  warningCount.textContent = warnings;
  infoCount.textContent = infos;
  pageCount.textContent = snapshots.length;

  summaryBar.style.display = currentIssues.length > 0 || snapshots.length > 0 ? "flex" : "none";
}

// --- Utilities ---

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

function getPathFragment(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const hash = u.hash || "";
    const combined = path + hash;
    return combined || "/";
  } catch {
    return url;
  }
}
