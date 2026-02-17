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
      }

      results[category].push(info);
    });
  }

  return results;
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
    });
  }
  return true;
});
