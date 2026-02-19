/**
 * Content script that extracts UI element information from the current page.
 * Collects buttons, inputs, headings, links, selects, textareas, and images
 * along with their computed styles for consistency analysis.
 */

function extractElements() {
  const selectors = {
    buttons: "button, [role='button'], input[type='button'], input[type='submit']",
    inputs: "input:not([type='button']):not([type='submit']):not([type='hidden']), textarea, select",
    headings: "h1, h2, h3, h4, h5, h6",
    links: "a[href]",
    images: "img",
  };

  const results = {};

  for (const [category, selector] of Object.entries(selectors)) {
    const elements = document.querySelectorAll(selector);
    results[category] = [];

    elements.forEach((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      const info = {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || el.value || el.alt || "").trim().substring(0, 100),
        classes: el.className || "",
        id: el.id || "",
        styles: {
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          borderRadius: computed.borderRadius,
          border: computed.border,
          padding: computed.padding,
          margin: computed.margin,
          lineHeight: computed.lineHeight,
          textAlign: computed.textAlign,
          textTransform: computed.textTransform,
          letterSpacing: computed.letterSpacing,
          width: computed.width,
          height: computed.height,
        },
        dimensions: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };

      if (category === "inputs") {
        info.type = el.type || "text";
        info.placeholder = el.placeholder || "";
      }

      if (category === "links") {
        info.href = el.href || "";
      }

      if (category === "images") {
        info.src = el.src || "";
        info.alt = el.alt || "";
        info.naturalWidth = el.naturalWidth;
        info.naturalHeight = el.naturalHeight;
        info.loading = el.loading || "";
        info.fetchPriority = el.fetchPriority || "";
        info.decoding = el.decoding || "";
        info.srcset = el.srcset || "";
        info.sizes = el.sizes || "";
        info.rectTop = rect.top;
        info.rectBottom = rect.bottom;
      }

      if (category === "buttons") {
        info.role = el.getAttribute("role") || "";
        info.ariaLabel = el.getAttribute("aria-label") || "";
        info.ariaLabelledBy = el.getAttribute("aria-labelledby") || "";
        info.tabIndex = el.tabIndex;
        info.title = el.title || "";
      }

      results[category].push(info);
    });
  }

  return results;
}

/**
 * Extract viewport height for above-fold calculations.
 */
function getViewportHeight() {
  return window.innerHeight;
}

/**
 * Get the text of the first h1 on the page.
 */
function getPrimaryH1Text() {
  const h1 = document.querySelector("h1");
  return h1 ? (h1.textContent || "").trim().substring(0, 200) : "";
}

/**
 * Build a lightweight content signature for duplicate detection.
 * Concatenates heading texts and element counts.
 */
function getContentSignature() {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((h) => h.textContent.trim().substring(0, 50))
    .join("|");
  const counts = [
    document.querySelectorAll("button, [role='button']").length,
    document.querySelectorAll("input").length,
    document.querySelectorAll("a[href]").length,
    document.querySelectorAll("img").length,
  ].join(",");
  return `${headings}::${counts}`;
}

/**
 * Collect DOM size statistics.
 */
function getDomStats() {
  const all = document.getElementsByTagName("*");
  let hiddenCount = 0;
  for (let i = 0; i < all.length; i++) {
    const computed = window.getComputedStyle(all[i]);
    if (
      computed.display === "none" ||
      computed.visibility === "hidden" ||
      (computed.opacity === "0" && all[i].getBoundingClientRect().width === 0)
    ) {
      hiddenCount++;
    }
  }
  return {
    totalElementCount: all.length,
    hiddenElementCount: hiddenCount,
  };
}

/**
 * Detect full-viewport overlay elements that may block content.
 */
function extractOverlays() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const overlays = [];
  const candidates = document.querySelectorAll("*");

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const computed = window.getComputedStyle(el);
    if (computed.position !== "fixed" && computed.position !== "absolute") continue;
    if (computed.display === "none") continue;

    const rect = el.getBoundingClientRect();
    const coversWidth = rect.width >= viewportWidth * 0.9;
    const coversHeight = rect.height >= viewportHeight * 0.9;

    if (coversWidth && coversHeight) {
      overlays.push({
        tag: el.tagName.toLowerCase(),
        classes: el.className || "",
        id: el.id || "",
        zIndex: computed.zIndex,
        opacity: computed.opacity,
        backgroundColor: computed.backgroundColor,
        pointerEvents: computed.pointerEvents,
        position: computed.position,
        dimensions: {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }
  }
  return overlays;
}

/**
 * Detect elements with large CSS background images in the viewport (hero candidates).
 */
function extractHeroCandidates() {
  const viewportHeight = window.innerHeight;
  const viewportArea = window.innerWidth * viewportHeight;
  const candidates = [];
  const elements = document.querySelectorAll("*");

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const computed = window.getComputedStyle(el);
    if (computed.backgroundImage === "none" || !computed.backgroundImage) continue;

    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > viewportHeight) continue;

    const area = rect.width * rect.height;
    if (area < viewportArea * 0.2) continue;

    candidates.push({
      tag: el.tagName.toLowerCase(),
      classes: el.className || "",
      id: el.id || "",
      backgroundImage: computed.backgroundImage.substring(0, 200),
      backgroundSize: computed.backgroundSize,
      rectTop: rect.top,
      dimensions: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  }
  return candidates;
}

/**
 * Detect skeleton/shimmer loading placeholders.
 */
function extractSkeletons() {
  const skeletons = [];
  const candidates = document.querySelectorAll(
    "[class*='skeleton'], [class*='shimmer'], [class*='placeholder'], [class*='loading']"
  );

  candidates.forEach((el) => {
    const computed = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    skeletons.push({
      tag: el.tagName.toLowerCase(),
      classes: el.className || "",
      id: el.id || "",
      styles: {
        backgroundColor: computed.backgroundColor,
        borderRadius: computed.borderRadius,
        animationName: computed.animationName,
      },
      dimensions: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
  });
  return skeletons;
}

/**
 * Collect third-party script and iframe hosts.
 */
function extractThirdPartyResources() {
  const pageHost = window.location.host;
  const thirdParties = new Map();

  document.querySelectorAll("script[src], iframe[src]").forEach((el) => {
    try {
      const url = new URL(el.src, window.location.href);
      if (url.host && url.host !== pageHost) {
        const existing = thirdParties.get(url.host) || { host: url.host, count: 0, types: new Set() };
        existing.count++;
        existing.types.add(el.tagName.toLowerCase());
        thirdParties.set(url.host, existing);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  });

  return [...thirdParties.values()].map((tp) => ({
    host: tp.host,
    count: tp.count,
    types: [...tp.types],
  }));
}

/**
 * Check if body/html has hidden visibility.
 */
function getBodyVisibility() {
  const bodyComputed = window.getComputedStyle(document.body);
  const htmlComputed = window.getComputedStyle(document.documentElement);
  return {
    bodyOpacity: bodyComputed.opacity,
    bodyVisibility: bodyComputed.visibility,
    htmlOpacity: htmlComputed.opacity,
    htmlVisibility: htmlComputed.visibility,
  };
}

/**
 * Detect whether the page is a Single Page Application by checking
 * for the presence of popular SPA framework root markers.
 * Returns the framework name if detected, or null.
 */
function detectSPAFramework() {
  // React: root element with _reactRootContainer or __react-root, or React devtools hook
  if (
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size > 0 ||
    document.querySelector("[data-reactroot]") ||
    document.querySelector("#root")?._reactRootContainer
  ) {
    return "react";
  }

  // Angular: ng-version attribute on root or angular global
  if (
    document.querySelector("[ng-version]") ||
    window.getAllAngularRootElements?.()?.length > 0
  ) {
    return "angular";
  }

  // Vue: __vue_app__ on root element or Vue devtools
  if (
    window.__VUE_DEVTOOLS_GLOBAL_HOOK__ ||
    document.querySelector("[data-v-app]") ||
    document.querySelector("#app")?.__vue_app__
  ) {
    return "vue";
  }

  // Svelte: __svelte_meta or $$set on root component elements
  if (document.querySelector("[class*='svelte-']")) {
    return "svelte";
  }

  // Ember
  if (window.Ember || document.querySelector("[id='ember-basic-dropdown-wormhole']")) {
    return "ember";
  }

  // Next.js (React-based but uses __NEXT_DATA__)
  if (window.__NEXT_DATA__) {
    return "nextjs";
  }

  // Nuxt (Vue-based but uses __NUXT__)
  if (window.__NUXT__) {
    return "nuxt";
  }

  return null;
}

/**
 * Build the effective page URL. For SPAs, include the hash fragment
 * as a distinct page identifier. For non-SPA sites, strip the hash
 * to avoid treating anchor links as separate pages.
 */
function getPageURL() {
  const loc = window.location;
  const framework = detectSPAFramework();
  const isSPA = framework !== null;

  if (isSPA && loc.hash) {
    // Keep the full URL including hash for SPA route tracking
    return loc.href;
  }

  // For non-SPA sites, strip the hash to avoid anchor-link noise
  return loc.origin + loc.pathname + loc.search;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_ELEMENTS") {
    const elements = extractElements();
    const framework = detectSPAFramework();
    sendResponse({
      url: getPageURL(),
      fullUrl: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      framework,
      isSPA: framework !== null,
      elements,
      viewportHeight: getViewportHeight(),
      primaryH1Text: getPrimaryH1Text(),
      contentSignature: getContentSignature(),
      domStats: getDomStats(),
      overlays: extractOverlays(),
      heroCandidates: extractHeroCandidates(),
      skeletons: extractSkeletons(),
      thirdPartyResources: extractThirdPartyResources(),
      bodyVisibility: getBodyVisibility(),
    });
  }
  return true;
});
