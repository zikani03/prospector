/**
 * Consistency analysis engine.
 * Compares UI elements across page snapshots to find inconsistencies
 * in styling, sizing, and structure.
 */

const Consistency = {
  /**
   * Analyze a single page snapshot for internal consistency issues.
   */
  analyzePage(snapshot) {
    const issues = [];
    const { elements } = snapshot;

    issues.push(...this._checkButtonConsistency(elements.buttons, snapshot.url));
    issues.push(...this._checkInputConsistency(elements.inputs, snapshot.url));
    issues.push(...this._checkHeadingHierarchy(elements.headings, snapshot.url));
    issues.push(...this._checkLinkConsistency(elements.links, snapshot.url));
    issues.push(...this._checkImageAccessibility(elements.images, snapshot.url));

    return issues;
  },

  /**
   * Compare elements across multiple page snapshots for cross-page inconsistencies.
   */
  compareSnapshots(snapshots) {
    if (snapshots.length < 2) return [];

    const issues = [];
    issues.push(...this._crossPageButtonConsistency(snapshots));
    issues.push(...this._crossPageInputConsistency(snapshots));
    issues.push(...this._crossPageHeadingConsistency(snapshots));
    issues.push(...this._crossPageFontConsistency(snapshots));

    return issues;
  },

  // --- Single-page checks ---

  _checkButtonConsistency(buttons, url) {
    const issues = [];
    if (buttons.length < 2) return issues;

    const styleGroups = this._groupByStyles(buttons, ["fontSize", "fontFamily", "borderRadius", "padding"]);

    if (styleGroups.length > 2) {
      issues.push({
        severity: "warning",
        category: "Buttons",
        message: `${styleGroups.length} different button styles found on this page`,
        detail: `Buttons use ${styleGroups.length} distinct style combinations for font-size, font-family, border-radius, and padding. Consider unifying them.`,
        url,
      });
    }

    const fontSizes = [...new Set(buttons.map((b) => b.styles.fontSize))];
    if (fontSizes.length > 2) {
      issues.push({
        severity: "warning",
        category: "Buttons",
        message: `Buttons use ${fontSizes.length} different font sizes: ${fontSizes.join(", ")}`,
        detail: "Consistent button font sizing improves visual hierarchy.",
        url,
      });
    }

    const borderRadii = [...new Set(buttons.map((b) => b.styles.borderRadius))];
    if (borderRadii.length > 2) {
      issues.push({
        severity: "info",
        category: "Buttons",
        message: `Buttons use ${borderRadii.length} different border-radius values: ${borderRadii.join(", ")}`,
        detail: "Mixing rounded and sharp buttons can look inconsistent.",
        url,
      });
    }

    buttons.forEach((btn) => {
      if (!btn.text && btn.tag === "button") {
        issues.push({
          severity: "error",
          category: "Buttons",
          message: "Button has no text content",
          detail: `A <${btn.tag}> element has no visible text, which hurts accessibility.`,
          url,
        });
      }
    });

    return issues;
  },

  _checkInputConsistency(inputs, url) {
    const issues = [];
    if (inputs.length < 2) return issues;

    const styleGroups = this._groupByStyles(inputs, ["fontSize", "border", "borderRadius", "padding"]);

    if (styleGroups.length > 2) {
      issues.push({
        severity: "warning",
        category: "Inputs",
        message: `${styleGroups.length} different input styles found on this page`,
        detail: "Inputs with inconsistent styling can confuse users about which fields are related.",
        url,
      });
    }

    inputs.forEach((input) => {
      if (input.type === "text" && !input.placeholder) {
        issues.push({
          severity: "info",
          category: "Inputs",
          message: `Text input without placeholder${input.id ? ` (#${input.id})` : ""}`,
          detail: "Placeholder text helps users understand what to enter.",
          url,
        });
      }
    });

    return issues;
  },

  _checkHeadingHierarchy(headings, url) {
    const issues = [];
    if (headings.length === 0) return issues;

    const levels = headings.map((h) => parseInt(h.tag.charAt(1)));

    // Check if hierarchy skips levels
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) {
        issues.push({
          severity: "warning",
          category: "Headings",
          message: `Heading hierarchy skips from h${levels[i - 1]} to h${levels[i]}`,
          detail: `"${headings[i - 1].text}" (h${levels[i - 1]}) is followed by "${headings[i].text}" (h${levels[i]}). Skipping heading levels hurts accessibility and SEO.`,
          url,
        });
      }
    }

    // Check if h1 exists
    if (!levels.includes(1)) {
      issues.push({
        severity: "info",
        category: "Headings",
        message: "Page has no h1 heading",
        detail: "Every page should have exactly one h1 for accessibility and SEO.",
        url,
      });
    }

    // Check multiple h1s
    const h1Count = levels.filter((l) => l === 1).length;
    if (h1Count > 1) {
      issues.push({
        severity: "warning",
        category: "Headings",
        message: `Page has ${h1Count} h1 headings`,
        detail: "Best practice is to have exactly one h1 per page.",
        url,
      });
    }

    // Check heading font-size consistency per level
    for (let level = 1; level <= 6; level++) {
      const sameLevel = headings.filter((h) => h.tag === `h${level}`);
      if (sameLevel.length > 1) {
        const fontSizes = [...new Set(sameLevel.map((h) => h.styles.fontSize))];
        if (fontSizes.length > 1) {
          issues.push({
            severity: "warning",
            category: "Headings",
            message: `h${level} headings have inconsistent font sizes: ${fontSizes.join(", ")}`,
            detail: "Same-level headings should be visually consistent.",
            url,
          });
        }
      }
    }

    return issues;
  },

  _checkLinkConsistency(links, url) {
    const issues = [];
    if (links.length < 2) return issues;

    const colors = [...new Set(links.map((l) => l.styles.color))];
    if (colors.length > 3) {
      issues.push({
        severity: "info",
        category: "Links",
        message: `Links use ${colors.length} different colors`,
        detail: "Too many link colors can make it hard for users to identify clickable elements.",
        url,
      });
    }

    return issues;
  },

  _checkImageAccessibility(images, url) {
    const issues = [];

    images.forEach((img) => {
      if (!img.alt) {
        issues.push({
          severity: "error",
          category: "Images",
          message: `Image missing alt text${img.src ? `: ${img.src.substring(0, 60)}` : ""}`,
          detail: "All images should have alt text for accessibility.",
          url,
        });
      }
    });

    return issues;
  },

  // --- Cross-page checks ---

  _crossPageButtonConsistency(snapshots) {
    const issues = [];
    const allStyles = new Map(); // url -> style signature set

    snapshots.forEach((snap) => {
      const sigs = new Set(
        snap.elements.buttons.map((b) =>
          [b.styles.fontSize, b.styles.fontFamily, b.styles.borderRadius, b.styles.padding].join("|")
        )
      );
      allStyles.set(snap.url, sigs);
    });

    const allSigs = new Set();
    allStyles.forEach((sigs) => sigs.forEach((s) => allSigs.add(s)));

    if (allSigs.size > 3) {
      issues.push({
        severity: "warning",
        category: "Cross-Page: Buttons",
        message: `${allSigs.size} different button styles found across ${snapshots.length} pages`,
        detail: "Button styles should be consistent across pages. Consider using a shared component or CSS class.",
      });
    }

    return issues;
  },

  _crossPageInputConsistency(snapshots) {
    const issues = [];
    const allSigs = new Set();

    snapshots.forEach((snap) => {
      snap.elements.inputs.forEach((input) => {
        allSigs.add([input.styles.fontSize, input.styles.border, input.styles.borderRadius, input.styles.padding].join("|"));
      });
    });

    if (allSigs.size > 3) {
      issues.push({
        severity: "warning",
        category: "Cross-Page: Inputs",
        message: `${allSigs.size} different input styles found across ${snapshots.length} pages`,
        detail: "Form inputs should look the same across your application for a coherent user experience.",
      });
    }

    return issues;
  },

  _crossPageHeadingConsistency(snapshots) {
    const issues = [];

    for (let level = 1; level <= 3; level++) {
      const fontSizes = new Set();
      snapshots.forEach((snap) => {
        snap.elements.headings
          .filter((h) => h.tag === `h${level}`)
          .forEach((h) => fontSizes.add(h.styles.fontSize));
      });

      if (fontSizes.size > 1) {
        issues.push({
          severity: "warning",
          category: "Cross-Page: Headings",
          message: `h${level} font size varies across pages: ${[...fontSizes].join(", ")}`,
          detail: `Heading level ${level} should have a consistent font size across all pages.`,
        });
      }
    }

    return issues;
  },

  _crossPageFontConsistency(snapshots) {
    const issues = [];
    const fontFamilies = new Set();

    snapshots.forEach((snap) => {
      for (const category of Object.values(snap.elements)) {
        category.forEach((el) => {
          if (el.styles.fontFamily) {
            fontFamilies.add(el.styles.fontFamily);
          }
        });
      }
    });

    if (fontFamilies.size > 3) {
      issues.push({
        severity: "info",
        category: "Cross-Page: Typography",
        message: `${fontFamilies.size} different font families used across pages`,
        detail: `Font families found: ${[...fontFamilies].map((f) => f.substring(0, 40)).join("; ")}. Most designs use 1-2 font families.`,
      });
    }

    return issues;
  },

  // --- Utilities ---

  _groupByStyles(elements, styleKeys) {
    const groups = new Map();
    elements.forEach((el) => {
      const key = styleKeys.map((k) => el.styles[k]).join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    return [...groups.values()];
  },
};
