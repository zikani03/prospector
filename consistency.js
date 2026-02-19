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
    issues.push(...this._checkAboveFoldLazyImages(snapshot));
    issues.push(...this._checkHeroImageHints(snapshot));
    issues.push(...this._checkBackgroundImageHero(snapshot));
    issues.push(...this._checkOverlayBlocking(snapshot));
    issues.push(...this._checkSkeletonConsistency(snapshot));
    issues.push(...this._checkTapTargets(snapshot));
    issues.push(...this._checkRoleButtonAccessibility(snapshot.elements.buttons, snapshot.url));
    issues.push(...this._checkThirdPartySurfaceArea(snapshot));

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
    issues.push(...this._crossPageStaleRouteMetadata(snapshots));
    issues.push(...this._crossPageUrlParamDuplication(snapshots));
    issues.push(...this._crossPageSameContentDifferentUrl(snapshots));
    issues.push(...this._crossPageThirdPartyDrift(snapshots));
    issues.push(...this._crossPageDomBloat(snapshots));
    issues.push(...this._crossPageSkeletonConsistency(snapshots));
    issues.push(...this._crossPageTapTargetDrift(snapshots));

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

  _checkAboveFoldLazyImages(snapshot) {
    const issues = [];
    const vh = snapshot.viewportHeight || 0;
    if (!vh) return issues;

    snapshot.elements.images.forEach((img) => {
      if (img.loading === "lazy" && img.rectTop < vh && img.rectBottom > 0) {
        const area = img.dimensions.width * img.dimensions.height;
        if (area > 120000) {
          issues.push({
            severity: "warning",
            category: "Images: Performance",
            message: `Above-the-fold image uses loading="lazy"${img.src ? `: ${img.src.substring(0, 60)}` : ""}`,
            detail: "Lazy-loading above-the-fold images delays their render and hurts perceived performance. Remove loading=\"lazy\" for hero/banner images.",
            url: snapshot.url,
          });
        }
      }
    });
    return issues;
  },

  _checkHeroImageHints(snapshot) {
    const issues = [];
    const vh = snapshot.viewportHeight || 0;
    if (!vh) return issues;

    const aboveFold = snapshot.elements.images.filter(
      (img) => img.rectTop < vh && img.rectBottom > 0
    );
    if (aboveFold.length === 0) return issues;

    const hero = aboveFold.reduce((largest, img) => {
      const area = img.dimensions.width * img.dimensions.height;
      const largestArea = largest.dimensions.width * largest.dimensions.height;
      return area > largestArea ? img : largest;
    }, aboveFold[0]);

    const heroArea = hero.dimensions.width * hero.dimensions.height;
    if (heroArea < 50000) return issues;

    if (!hero.fetchPriority || hero.fetchPriority === "auto") {
      issues.push({
        severity: "info",
        category: "Images: Performance",
        message: `Largest above-fold image missing fetchpriority="high"${hero.src ? `: ${hero.src.substring(0, 60)}` : ""}`,
        detail: "Adding fetchpriority=\"high\" to the hero image helps the browser prioritize its download, improving LCP.",
        url: snapshot.url,
      });
    }

    if (hero.decoding === "sync") {
      issues.push({
        severity: "warning",
        category: "Images: Performance",
        message: `Hero image uses decoding="sync"${hero.src ? `: ${hero.src.substring(0, 60)}` : ""}`,
        detail: "Synchronous decoding blocks the main thread. Use decoding=\"async\" or remove the attribute.",
        url: snapshot.url,
      });
    }

    return issues;
  },

  _checkBackgroundImageHero(snapshot) {
    const issues = [];
    if (!snapshot.heroCandidates || snapshot.heroCandidates.length === 0) return issues;

    snapshot.heroCandidates.forEach((candidate) => {
      issues.push({
        severity: "warning",
        category: "Layout: Performance",
        message: `Large above-fold element uses CSS background-image instead of <img>`,
        detail: `<${candidate.tag}>${candidate.id ? ` #${candidate.id}` : ""}${candidate.classes ? ` .${String(candidate.classes).split(" ")[0]}` : ""} (${candidate.dimensions.width}×${candidate.dimensions.height}px) uses background-image. The browser discovers CSS background images later than <img> elements, delaying LCP.`,
        url: snapshot.url,
      });
    });

    return issues;
  },

  _checkOverlayBlocking(snapshot) {
    const issues = [];

    if (snapshot.bodyVisibility) {
      const bv = snapshot.bodyVisibility;
      if (bv.bodyOpacity === "0" || bv.bodyVisibility === "hidden") {
        issues.push({
          severity: "error",
          category: "UX: Render Blocking",
          message: "Page body is hidden (opacity: 0 or visibility: hidden)",
          detail: "The page body is not visible. This may indicate a hydration gate, A/B test script, or anti-flicker snippet blocking content render.",
          url: snapshot.url,
        });
      }
      if (bv.htmlOpacity === "0" || bv.htmlVisibility === "hidden") {
        issues.push({
          severity: "error",
          category: "UX: Render Blocking",
          message: "HTML root element is hidden",
          detail: "The <html> element is not visible, blocking all content from rendering.",
          url: snapshot.url,
        });
      }
    }

    if (snapshot.overlays && snapshot.overlays.length > 0) {
      snapshot.overlays.forEach((overlay) => {
        if (overlay.opacity !== "0" && overlay.pointerEvents !== "none") {
          issues.push({
            severity: "warning",
            category: "UX: Render Blocking",
            message: `Full-viewport overlay detected (${overlay.tag}${overlay.id ? ` #${overlay.id}` : ""})`,
            detail: `A ${overlay.position}-positioned element covers the viewport (${overlay.dimensions.width}×${overlay.dimensions.height}px, z-index: ${overlay.zIndex}). This may block user interaction and delay perceived content visibility.`,
            url: snapshot.url,
          });
        }
      });
    }

    return issues;
  },

  _checkSkeletonConsistency(snapshot) {
    const issues = [];
    if (!snapshot.skeletons || snapshot.skeletons.length < 2) return issues;

    const styleGroups = this._groupByStyles(
      snapshot.skeletons.map((s) => ({ styles: s.styles })),
      ["backgroundColor", "borderRadius"]
    );

    if (styleGroups.length > 2) {
      issues.push({
        severity: "info",
        category: "UX: Loading States",
        message: `${styleGroups.length} different skeleton/placeholder styles on this page`,
        detail: "Skeleton placeholders should have consistent colors and shapes for a polished loading experience.",
        url: snapshot.url,
      });
    }

    return issues;
  },

  _checkTapTargets(snapshot) {
    const issues = [];
    const minSize = 44;
    const tappable = [
      ...snapshot.elements.buttons,
      ...snapshot.elements.links,
    ];

    tappable.forEach((el) => {
      const smaller = Math.min(el.dimensions.width, el.dimensions.height);
      if (smaller > 0 && smaller < minSize) {
        issues.push({
          severity: "warning",
          category: "UX: Tap Targets",
          message: `Small tap target: <${el.tag}>${el.text ? ` "${el.text.substring(0, 20)}"` : ""} is ${el.dimensions.width}×${el.dimensions.height}px`,
          detail: `Interactive elements should be at least ${minSize}×${minSize}px for comfortable touch interaction.`,
          url: snapshot.url,
        });
      }
    });

    return issues;
  },

  _checkRoleButtonAccessibility(buttons, url) {
    const issues = [];

    buttons.forEach((btn) => {
      const hasAccessibleName = btn.ariaLabel || btn.title || btn.text;

      if (btn.role === "button" || btn.tag !== "button") {
        if (!hasAccessibleName) {
          issues.push({
            severity: "error",
            category: "Buttons: Accessibility",
            message: `Interactive element without accessible name: <${btn.tag}>${btn.id ? ` #${btn.id}` : ""}${btn.classes ? ` .${String(btn.classes).split(" ")[0]}` : ""}`,
            detail: "Buttons without visible text need an aria-label or title attribute for screen reader users.",
            url,
          });
        }

        if (btn.role === "button" && (btn.tabIndex === undefined || btn.tabIndex < 0)) {
          issues.push({
            severity: "warning",
            category: "Buttons: Accessibility",
            message: `role="button" element not keyboard focusable: <${btn.tag}>${btn.id ? ` #${btn.id}` : ""}`,
            detail: "Elements with role=\"button\" should have tabindex=\"0\" to be keyboard accessible.",
            url,
          });
        }
      }
    });

    return issues;
  },

  _checkThirdPartySurfaceArea(snapshot) {
    const issues = [];
    if (!snapshot.thirdPartyResources) return issues;

    if (snapshot.thirdPartyResources.length > 10) {
      const hosts = snapshot.thirdPartyResources.map((tp) => tp.host).join(", ");
      issues.push({
        severity: "warning",
        category: "Performance: Third Parties",
        message: `${snapshot.thirdPartyResources.length} third-party origins found on this page`,
        detail: `Third-party hosts: ${hosts.substring(0, 200)}. Each additional origin adds DNS/connection overhead and may impact performance.`,
        url: snapshot.url,
      });
    }

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

  _crossPageStaleRouteMetadata(snapshots) {
    const issues = [];
    if (!snapshots.some((s) => s.isSPA)) return issues;

    const uniqueUrls = new Set(snapshots.map((s) => s.url));
    if (uniqueUrls.size < 2) return issues;

    const uniqueTitles = new Set(snapshots.map((s) => s.title));
    if (uniqueTitles.size === 1 && uniqueUrls.size > 1) {
      issues.push({
        severity: "warning",
        category: "Cross-Page: SPA Navigation",
        message: `All ${snapshots.length} pages share the same title: "${[...uniqueTitles][0].substring(0, 60)}"`,
        detail: "SPA routes should update document.title on navigation for better UX, tab management, and accessibility.",
      });
    }

    const h1Texts = snapshots.map((s) => s.primaryH1Text || "");
    const uniqueH1s = new Set(h1Texts.filter((t) => t));
    if (uniqueH1s.size === 1 && uniqueUrls.size > 2) {
      issues.push({
        severity: "info",
        category: "Cross-Page: SPA Navigation",
        message: `All pages share the same h1: "${[...uniqueH1s][0].substring(0, 60)}"`,
        detail: "The primary heading should reflect the current route content.",
      });
    }

    return issues;
  },

  _crossPageUrlParamDuplication(snapshots) {
    const issues = [];
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "ref", "source"];

    function stripTracking(urlStr) {
      try {
        const u = new URL(urlStr);
        trackingParams.forEach((p) => u.searchParams.delete(p));
        u.searchParams.sort();
        return u.origin + u.pathname + u.search;
      } catch {
        return urlStr;
      }
    }

    const normalized = new Map();
    snapshots.forEach((snap) => {
      const clean = stripTracking(snap.fullUrl || snap.url);
      if (!normalized.has(clean)) normalized.set(clean, []);
      normalized.get(clean).push(snap.fullUrl || snap.url);
    });

    normalized.forEach((urls, clean) => {
      if (urls.length > 1) {
        issues.push({
          severity: "warning",
          category: "Cross-Page: URL Hygiene",
          message: `${urls.length} snapshots map to the same URL after stripping tracking params`,
          detail: `Normalized URL: ${clean.substring(0, 100)}. Consider stripping tracking parameters client-side, using canonical URLs, or implementing No-Vary-Search on the server.`,
        });
      }
    });

    return issues;
  },

  _crossPageSameContentDifferentUrl(snapshots) {
    const issues = [];
    const sigMap = new Map();

    snapshots.forEach((snap) => {
      const sig = snap.contentSignature;
      if (!sig) return;
      if (!sigMap.has(sig)) sigMap.set(sig, []);
      sigMap.get(sig).push(snap.url);
    });

    sigMap.forEach((urls, sig) => {
      const uniqueUrls = [...new Set(urls)];
      if (uniqueUrls.length > 1) {
        issues.push({
          severity: "warning",
          category: "Cross-Page: Content Duplication",
          message: `${uniqueUrls.length} different URLs serve effectively identical content`,
          detail: `URLs: ${uniqueUrls.map((u) => u.substring(0, 80)).join(", ")}. This may indicate URL parameter noise or routing misconfiguration.`,
        });
      }
    });

    return issues;
  },

  _crossPageThirdPartyDrift(snapshots) {
    const issues = [];
    const pageCounts = snapshots
      .filter((s) => s.thirdPartyResources)
      .map((s) => ({ url: s.url, count: s.thirdPartyResources.length }));

    if (pageCounts.length < 2) return issues;

    const counts = pageCounts.map((p) => p.count);
    const min = Math.min(...counts);
    const max = Math.max(...counts);

    if (max > 0 && max - min > 5) {
      const minPage = pageCounts.find((p) => p.count === min);
      const maxPage = pageCounts.find((p) => p.count === max);
      issues.push({
        severity: "warning",
        category: "Cross-Page: Third Parties",
        message: `Third-party count varies widely: ${min} to ${max} across pages`,
        detail: `Fewest (${min}): ${minPage.url.substring(0, 60)}; Most (${max}): ${maxPage.url.substring(0, 60)}. Large variance may cause inconsistent performance and user experience across routes.`,
      });
    }

    return issues;
  },

  _crossPageDomBloat(snapshots) {
    const issues = [];
    const withStats = snapshots.filter((s) => s.domStats);
    if (withStats.length < 2) return issues;

    const counts = withStats.map((s) => s.domStats.totalElementCount);
    const first = counts[0];
    const last = counts[counts.length - 1];

    let monotonic = true;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < counts[i - 1]) {
        monotonic = false;
        break;
      }
    }

    if (monotonic && last > first * 1.3 && counts.length >= 3) {
      issues.push({
        severity: "warning",
        category: "Cross-Page: SPA Health",
        message: `DOM size grew from ${first} to ${last} elements across ${counts.length} navigations`,
        detail: "DOM element count is increasing with each navigation, suggesting old route views are not being unmounted. This can degrade performance over time.",
      });
    }

    const lastSnap = withStats[withStats.length - 1];
    const hiddenRatio = lastSnap.domStats.hiddenElementCount / lastSnap.domStats.totalElementCount;
    if (hiddenRatio > 0.3 && lastSnap.domStats.hiddenElementCount > 100) {
      issues.push({
        severity: "info",
        category: "Cross-Page: SPA Health",
        message: `${Math.round(hiddenRatio * 100)}% of DOM elements are hidden (${lastSnap.domStats.hiddenElementCount} of ${lastSnap.domStats.totalElementCount})`,
        detail: "A large proportion of hidden elements may indicate retained but unmounted views in an SPA.",
      });
    }

    return issues;
  },

  _crossPageSkeletonConsistency(snapshots) {
    const issues = [];
    const withSkeletons = snapshots.filter((s) => s.skeletons && s.skeletons.length > 0);
    if (withSkeletons.length < 2) return issues;

    const allSigs = new Set();
    withSkeletons.forEach((snap) => {
      snap.skeletons.forEach((sk) => {
        allSigs.add([sk.styles.backgroundColor, sk.styles.borderRadius].join("|"));
      });
    });

    if (allSigs.size > 3) {
      issues.push({
        severity: "warning",
        category: "Cross-Page: Loading States",
        message: `${allSigs.size} different skeleton styles found across ${withSkeletons.length} pages`,
        detail: "Loading placeholders should look consistent across all routes for a polished experience.",
      });
    }

    return issues;
  },

  _crossPageTapTargetDrift(snapshots) {
    const issues = [];
    if (snapshots.length < 2) return issues;

    const medianSizes = snapshots.map((snap) => {
      const tappable = [...snap.elements.buttons, ...snap.elements.links];
      if (tappable.length === 0) return null;
      const sizes = tappable
        .map((el) => Math.min(el.dimensions.width, el.dimensions.height))
        .filter((s) => s > 0)
        .sort((a, b) => a - b);
      if (sizes.length === 0) return null;
      return { url: snap.url, median: sizes[Math.floor(sizes.length / 2)] };
    }).filter(Boolean);

    if (medianSizes.length < 2) return issues;

    const medians = medianSizes.map((m) => m.median);
    const min = Math.min(...medians);
    const max = Math.max(...medians);

    if (max > 0 && min > 0 && max / min > 2) {
      issues.push({
        severity: "info",
        category: "Cross-Page: Tap Targets",
        message: `Median interactive element size varies widely: ${min}px to ${max}px across pages`,
        detail: "Large variation in tap target sizes across routes may indicate inconsistent UI density or missing design tokens.",
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
