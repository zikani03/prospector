# Prospector — UI Consistency Checker

A Chrome DevTools extension that tracks visited pages and compares UI elements (buttons, inputs, headings, links, images) for visual and structural consistency.

> NOTE: still in early development. Built with the help of [Amp](https://ampcode.com)

![[]](./screenshot-0.png)

## Features

- **DevTools Panel** — appears as a "Prospector" tab alongside Elements, Console, etc.
- **Page Scanning** — extracts buttons, inputs, headings, links, and images with their computed styles
- **Single-Page Analysis** — checks for inconsistent button/input styles, heading hierarchy issues, missing alt text, and more
- **Cross-Page Comparison** — compares elements across visited pages to find inconsistencies in fonts, sizes, colors, and spacing
- **VS Code-style Issues View** — issues grouped by category with error/warning/info severity levels
- **Element Inspector** — browse all extracted elements and their styles in a table view
- **Recommendations Tab** — actionable guidance (ESLint, a11y checkers, headings/images/button-input standardization) based on found issues

## Installation

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory
4. Open DevTools (F12) on any page — the **Prospector** tab will appear

## Usage

1. Navigate to a page and open DevTools → **Prospector** tab
2. Click **⟳ Scan Page** to analyze the current page
3. Navigate to other pages in the same site and scan each one
4. Click **⇔ Compare All** to find cross-page inconsistencies
5. Browse the **Issues**, **Pages**, and **Elements** tabs

## Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `devtools.html/js` | Registers the DevTools panel |
| `panel.html/js` | Panel UI and controller |
| `consistency.js` | Consistency analysis engine |
| `content_script.js` | Extracts UI elements from pages |
| `background.js` | Service worker — relays messages and stores snapshots |
