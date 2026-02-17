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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_ELEMENTS") {
    const elements = extractElements();
    sendResponse({
      url: window.location.href,
      title: document.title,
      timestamp: Date.now(),
      elements,
    });
  }
  return true;
});
