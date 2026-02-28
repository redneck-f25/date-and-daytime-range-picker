# Changelog
<!-- markdownlint-disable MD024 -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Attribution: Portions of this project were generated with the assistance of M365 Copilot and are inspired and curated by Daniel Hammerschmidt.

---

## [Unreleased]

### Added

- (placeholder) …

### Changed

- (placeholder) …

### Fixed

- (placeholder) …

---

## [1.0.0] - 2026-02-27

### Added

- **Split files** into reusable units:
  - `src/date-and-daytime-range-picker.html` (Shadow DOM template: HTML + CSS)
  - `src/date-and-daytime-range-picker.js` (ES module logic that `fetch()`es the template)
  - `example/demo.html` demo host with **external min/max date inputs**
- **Time zone selector** via `<input type="text" list="timezones">` + `<datalist>`:
  - Populated from `Intl.supportedValuesOf('timeZone')` when available (fallback list otherwise)
  - **Ensures `UTC` is the first option** if not included by the platform
  - **Validation** against IANA TZ (using `Intl.DateTimeFormat({ timeZone })`)
  - **Select-like UX**:
    - On **focus**: placeholder becomes current TZ, input value clears for faster typing
    - On **Escape**: input clears (keeps focus)
    - On **blur** with empty input: TZ reverts to the previous value (placeholder)
- **Dual sliders** for Date and Time ranges, each with:
  - Two thumbs (start/end)
  - **Track drag**: drag anywhere on the track to **shift the entire selection** preserving width
  - **Recenter on click**: click the track to **center** the selection on the clicked point
- **Time-of-day wrap across midnight** (e.g., `22:00 → 06:00`) with **two fill segments** to visualize wrap
- **Tick marks & labels** on both tracks:
  - Dates: adaptive steps from `[1, 2, 5, 7, 14, 30, 60, 90, 120, 180, 365]` with emphasized month starts
  - Times: adaptive steps from `[15, 30, 60, 120, 180, 240]` with emphasized whole hours
- **ISO 8601 outputs**:
  - Split fields: `dateStart`, `dateEnd`, `timeStart`, `timeEnd`
  - Combined: `rangeStartDateTimeISO`, `rangeEndDateTimeISO` **with `±HH:MM` offset** from selected time zone
- **Events**:
  - `input` (live updates while adjusting)
  - `change` (committed updates on release/blur/recenter/drag end)
- **Public API**:
  - `el.dateRange` (get/set via `Date` or ISO `YYYY-MM-DD`)
  - `el.timeRange` (get/set via minutes; preserves wrap if `end < start`)
  - `el.timeZone` (get/set IANA zone string)
- **Theming** via CSS custom properties (e.g., `--accent`, `--track-h`, `--handle-size`, tick colors/sizes)

### Changed

- Internal structure refactored to **load external template** via `fetch()` using `import.meta.url` for robust relative resolution.
- Improved component **robustness**: attribute updates are now **state-first** and **render-later**.

### Fixed

- **Race conditions** during initial load after splitting files:
  - Introduced a **`#ready` gate** so `attributeChangedCallback` does **not** call renderers until the template is attached and element refs exist.
  - Prevents `TypeError: Cannot set properties of undefined` for inputs/fills/tick containers.
- Minor CSS z‑index and pointer‑events harmony for thumbs vs. track to keep dragging reliable.
- Avoided duplicate `const E = this.#els;` declarations to prevent “cannot redeclare” errors when wiring events.

---

## 0.6.0 - 2026-02-26

### Added

- **Recenter on click** for both date and time tracks (with small click threshold to distinguish from drag).
- **Track dragging**: moving the track shifts both thumbs and preserves selection width.

### Changed

- Refined fill rendering for over‑midnight **two‑segment** visualization.

---

## 0.5.0 - 2026-02-26

### Added

- **Time zone support** (initial): selector, offset preview, and combined ISO datetimes with offset.
- **Cross‑midnight** support for time range semantics (`end < start` represents wrap).

---

## 0.4.0 - 2026-02-25

### Added

- Full **ISO 8601** consistency for date inputs (`YYYY-MM-DD`) and time inputs (`HH:MM:SS`) and emitted values.

---

## 0.3.0 - 2026-02-25

### Added

- Dual‑handle sliders for **date** and **time** ranges.
- Native `<input type="date">` and `<input type="time">` mirroring sliders.

---

## 0.2.0 - 2026-02-24

### Added

- Initial **Web Component** with Shadow DOM and CSS variables.
- `input` / `change` event emission with split ISO values.

---

## 0.1.0 - 2026-02-24

### Added

- Project skeleton and first interactive prototype:
  - Basic date range and time-of-day range.
  - Minimal styling, no external dependencies.

---

[Unreleased]: https://redneck-f25/date-and-daytime-range-picker/compare/v1.0.0...HEAD
[1.0.0]: https://redneck-f25/date-and-daytime-range-picker/releases/tag/v1.0.0
