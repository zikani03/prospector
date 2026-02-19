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
const btnExport = document.getElementById("btn-export");
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
const recsEmpty = document.getElementById("recs-empty");
const recsList = document.getElementById("recs-list");

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
  renderRecommendations(currentIssues);
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

btnExport.addEventListener("click", () => {
  if (snapshots.length === 0 && currentIssues.length === 0) {
    statusText.textContent = "Nothing to export";
    return;
  }

  const issuesByCategory = {};
  currentIssues.forEach((issue) => {
    if (!issuesByCategory[issue.category]) issuesByCategory[issue.category] = [];
    issuesByCategory[issue.category].push({
      severity: issue.severity,
      message: issue.message,
      detail: issue.detail || null,
      url: issue.url || null,
    });
  });

  const report = {
    exportedAt: new Date().toISOString(),
    summary: {
      totalPages: snapshots.length,
      totalIssues: currentIssues.length,
      errors: currentIssues.filter((i) => i.severity === "error").length,
      warnings: currentIssues.filter((i) => i.severity === "warning").length,
      info: currentIssues.filter((i) => i.severity === "info").length,
    },
    pages: snapshots.map((snap) => ({
      url: snap.fullUrl || snap.url,
      title: snap.title,
      scannedAt: new Date(snap.timestamp).toISOString(),
      framework: snap.framework || null,
      isSPA: snap.isSPA || false,
      elementCounts: Object.fromEntries(
        Object.entries(snap.elements).map(([cat, els]) => [cat, els.length])
      ),
    })),
    issues: issuesByCategory,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prospector-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  statusText.textContent = "Report exported";
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
      renderRecommendations(currentIssues);
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

function renderRecommendations(issues) {
  // Base recommendations always shown
  const baseRecs = [
    {
      title: "Adopt ESLint (JavaScript/TypeScript)",
      details: "Use ESLint with accessibility plugins (jsx-a11y for React) to catch common a11y and consistency issues during development.",
      link: "https://eslint.org/"
    },
    {
      title: "Use an Accessibility Checker",
      details: "Run axe DevTools or Lighthouse to audit color contrast, ARIA, and structural accessibility problems.",
      link: "https://www.deque.com/axe/devtools/"
    },
    {
      title: "Add Pre-commit Hooks",
      details: "Use lint-staged + husky to run linters before commits for early feedback.",
      link: "https://github.com/okonet/lint-staged"
    }
  ];

  // Derive hints from current issues
  const hasHeadingIssues = issues.some(i => i.category.includes("Headings"));
  const hasImageIssues = issues.some(i => i.category.includes("Images"));
  const hasButtonOrInput = issues.some(i => i.category.includes("Buttons") || i.category.includes("Inputs"));

  const dynamic = [];
  if (hasHeadingIssues) {
    dynamic.push({
      title: "Heading Hierarchy Guidelines",
      details: "Ensure a single h1 per page and avoid skipping levels (e.g., h2 after h1, then h3). Consider lint rules in your framework or content guidelines.",
      link: "https://web.dev/heading-order/"
    });
  }
  if (hasImageIssues) {
    dynamic.push({
      title: "Image Alt Text Checks",
      details: "Require non-empty alt text for meaningful images. Consider CI checks using axe or similar.",
      link: "https://webaim.org/techniques/alttext/"
    });
  }
  if (hasButtonOrInput) {
    dynamic.push({
      title: "Standardize Buttons and Inputs",
      details: "Adopt a shared UI component library or design tokens for fonts, radii, padding, and colors.",
      link: "https://material.io/components?platform=web"
    });
  }

  const hasImagePerf = issues.some(i => i.category.includes("Images: Performance"));
  const hasLayoutPerf = issues.some(i => i.category.includes("Layout: Performance"));
  const hasOverlay = issues.some(i => i.category.includes("Render Blocking"));
  const hasTapTarget = issues.some(i => i.category.includes("Tap Targets"));
  const hasA11yButton = issues.some(i => i.category.includes("Accessibility"));
  const hasThirdParty = issues.some(i => i.category.includes("Third Parties"));
  const hasSpaNav = issues.some(i => i.category.includes("SPA Navigation") || i.category.includes("SPA Health"));
  const hasUrlHygiene = issues.some(i => i.category.includes("URL Hygiene") || i.category.includes("Content Duplication"));
  const hasLoadingStates = issues.some(i => i.category.includes("Loading States"));

  if (hasImagePerf || hasLayoutPerf) {
    dynamic.push({
      title: "Optimize LCP Images",
      details: "Use <img> with fetchpriority=\"high\" for hero images. Avoid loading=\"lazy\" on above-the-fold content. Prefer <img> over CSS background-image for LCP candidates.",
      link: "https://web.dev/articles/optimize-lcp"
    });
  }
  if (hasOverlay) {
    dynamic.push({
      title: "Remove Render-Blocking Overlays",
      details: "Full-viewport overlays and hidden body/html block content visibility. Review anti-flicker snippets, A/B test loaders, and hydration gates.",
      link: "https://web.dev/articles/optimize-lcp#optimize_render_delay"
    });
  }
  if (hasTapTarget) {
    dynamic.push({
      title: "Increase Tap Target Sizes",
      details: "Interactive elements should be at least 44×44px per WCAG 2.5.8. Use min-width/min-height or padding to meet the threshold.",
      link: "https://web.dev/articles/accessible-tap-targets"
    });
  }
  if (hasA11yButton) {
    dynamic.push({
      title: "Add Accessible Names to Interactive Elements",
      details: "Icon-only buttons and role=\"button\" elements need aria-label or title. Ensure custom buttons are focusable with tabindex=\"0\".",
      link: "https://www.w3.org/WAI/ARIA/apg/patterns/button/"
    });
  }
  if (hasThirdParty) {
    dynamic.push({
      title: "Audit Third-Party Scripts",
      details: "Each third-party origin adds DNS lookup and connection overhead. Audit and remove unused scripts; consider self-hosting critical resources.",
      link: "https://web.dev/articles/optimizing-content-efficiency-loading-third-party-javascript"
    });
  }
  if (hasSpaNav) {
    dynamic.push({
      title: "Improve SPA Navigation Hygiene",
      details: "Update document.title and h1 on route changes. Unmount old route views to prevent DOM bloat. Consider the View Transitions API for smoother navigation.",
      link: "https://developer.chrome.com/docs/web-platform/view-transitions"
    });
  }
  if (hasUrlHygiene) {
    dynamic.push({
      title: "Clean Up URL Parameters",
      details: "Strip tracking parameters client-side and use canonical URLs. Consider implementing No-Vary-Search headers to improve prefetch cache hit rates.",
      link: "https://developer.chrome.com/docs/web-platform/no-vary-search"
    });
  }
  if (hasLoadingStates) {
    dynamic.push({
      title: "Standardize Loading Placeholders",
      details: "Use consistent skeleton/shimmer styles (color, border-radius, animation) across all routes via shared CSS classes or design tokens.",
      link: "https://web.dev/articles/ux-basics"
    });
  }

  const recs = [...baseRecs, ...dynamic];

  if (recs.length === 0) {
    recsEmpty.style.display = "flex";
    recsList.innerHTML = "";
    return;
  }

  recsEmpty.style.display = "none";
  let html = "";
  recs.forEach(r => {
    html += `
      <div class="issue-group">
        <div class="issue-group-header">
          <span class="arrow">▼</span>
          ${escapeHtml(r.title)}
        </div>
        <ul class="issue-list">
          <li class="issue-item">
            <span class="issue-icon info">ℹ</span>
            <span class="issue-message">
              ${escapeHtml(r.details)}
              ${r.link ? `<div class="issue-detail"><a href="${r.link}" target="_blank">${escapeHtml(r.link)}</a></div>` : ""}
            </span>
          </li>
        </ul>
      </div>
    `;
  });
  recsList.innerHTML = html;
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
