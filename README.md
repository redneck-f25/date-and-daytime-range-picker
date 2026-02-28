# `<date-and-daytime-range-picker>` — Framework‑free Date & Time Range Picker (Web Component)

A lightweight, dependency‑free **Web Component** that provides:

- **Date range** with native `<input type="date">` + dual‑handle slider
- **Time-of-day range** with native `<input type="time">` + dual‑handle slider
- Support for **over‑midnight** windows (e.g., 22:00 → 06:00)
- **Track dragging** (shift entire selection while preserving range width)
- **Recenter on click** (center the selection on the clicked point)
- **Tick marks & labels** for both tracks
- **Time zone selector** using `<input list="timezones">` + `<datalist>`
  - Auto-complete
  - Validates IANA time zones
  - Always includes `UTC` as the first entry
  - “Select-like with autocomplete” UX:
    - Focus: placeholder = previous value; input cleared
    - Escape: clears input
    - Blur with empty input: restores previous TZ
- **External min/max date inputs** (outside component) to control bounds
- Emits **combined ISO 8601 datetimes with offset**
- Pure client-side, no dependencies

> **Attribution**: Portions of this project were generated with the assistance of M365 Copilot and are inspired and curated by Daniel Hammerschmidt.

---

## Quick Start

### 1. Import the component

```html
<script type="module" src="./date-and-daytime-range-picker.js"></script>
```

### 2. Use the element

```html
<date-and-daytime-range-picker
  min-date="2025-01-01"
  max-date="2026-12-31"
  time-step="15"
  date-step-days="1"
  default-tz="Europe/Berlin"
></date-and-daytime-range-picker>
```

### 3. Optional: Wire external bounds

```html
<input id="extMinDate" type="date" value="2025-01-01">
<input id="extMaxDate" type="date" value="2026-12-31">

<script type="module">
  const el = document.querySelector('date-and-daytime-range-picker');
  const extMinDate = document.getElementById('extMinDate');
  const extMaxDate = document.getElementById('extMaxDate');

  function updateBounds() {
    const min = extMinDate.value;
    const max = extMaxDate.value;
    if (min && max && min > max) return; // ignore invalid combo
    if (min) el.setAttribute('min-date', min);
    if (max) el.setAttribute('max-date', max);
  }
  extMinDate.addEventListener('input', updateBounds);
  extMaxDate.addEventListener('input', updateBounds);
</script>
```

---

## Attributes

| Attribute        | Type         | Default                        | Description                  |
|------------------|--------------|--------------------------------|------------------------------|
| `min-date`       | YYYY‑MM‑DD   | fallback: 30 days before today | Lower bound of date range    |
| `max-date`       | YYYY‑MM‑DD   | today                          | Upper bound of date range    |
| `time-step`      | integer      | 15                             | Minutes per time slider step |
| `date-step-days` | integer      | 1                              | Days per date slider step    |
| `default-tz`     | IANA TZ      | system TZ or UTC               | Initial time zone            |

---

## Events & Payload

The component emits:

- `input` — live updates (dragging, typing)
- `change` — committed changes (thumb release, blur, recenter, drag end)

**Example payload:**

```json
{
  "dateStart": "2026-02-01",
  "dateEnd": "2026-02-28",
  "timeStart": "22:00:00",
  "timeEnd": "06:00:00",
  "timeZone": "Europe/Berlin",
  "crossesMidnight": true,
  "timeStartMinutes": 1320,
  "timeEndMinutes": 360,
  "rangeStartDateTimeISO": "2026-02-01T22:00:00+01:00",
  "rangeEndDateTimeISO": "2026-02-02T06:00:00+01:00"
}
```

---

## Public API

### Read current ranges

```js
const el = document.querySelector('date-and-daytime-range-picker');

const { start, end } = el.dateRange;                 // JS Date (local date-only)
const { startMinutes, endMinutes, crossesMidnight } = el.timeRange;
const tz = el.timeZone;
```

### Set ranges

```js
el.dateRange = { start: '2026-02-01', end: '2026-02-28' };
el.timeRange = { startMinutes: 1320, endMinutes: 360 }; // 22:00→06:00 wrap
el.timeZone  = 'UTC';
```

---

## Time Zone Input UX

The time zone selector is:

```html
<input id="tzInput" type="text" list="timezones">
<datalist id="timezones"></datalist>
```

### Behaviors

- Populated from `Intl.supportedValuesOf('timeZone')` (fallback list otherwise)
- `UTC` always added first if missing
- Validation uses `Intl.DateTimeFormat({ timeZone })`
- UX enhancements:
  - **focus** → placeholder = previous TZ, input cleared
  - **escape** → clear input
  - **blur** (empty) → restore previous TZ
  - invalid inputs marked with `.invalid`

---

## Implementation Notes

### Template loading

`date-and-daytime-range-picker.js` loads the external HTML template via:

```js
const templateURL = new URL('./date-and-daytime-range-picker.html', import.meta.url);
```

This keeps HTML/CSS reusable and separate from JS logic.

### Ready guard

A private `#ready` flag ensures `attributeChangedCallback` does not attempt rendering before:

1. Template is fetched
2. Shadow DOM is populated
3. Element references are cached

This avoids “Cannot set properties of undefined” errors.

### Interactions

- Stacked range inputs for dual-handle sliders
- Drag entire track to shift window
- Click track to recenter
- Smooth wrap-around for midnight ranges

### Ticks

- Date ticks choose adaptive step from `[1,2,5,7,14,30,60,90,120,180,365]`
- Time ticks choose from `[15,30,60,120,180,240]`
- Major ticks (month start / whole hour) emphasized and labeled

---

## Theming

Use CSS variables:

```css
date-and-daytime-range-picker {
  --accent: #0ea5e9;
  --fill: #0ea5e9;
  --track-h: 8px;
  --handle-size: 18px;

  --tick-font-size: 11px;
  --tick-color: #9ca3af;
  --tick-strong-color: #374151;
  --tick-label-color: #4b5563;
}
```

---

## Contributing

PRs welcome. Ideas:

- Optional `mode="daily|continuous"` range semantics
- Month-name ticks (`Jan 2026`)
- Keyboard shortcuts for nudging selection
- Accessibility enhancements
- Bundling for npm + GitHub Pages demo

---

## License

**MIT** (see `LICENSE`)

Attribution required:

> “Portions of this project were generated with the assistance of M365 Copilot and are inspired and curated by Daniel Hammerschmidt.”
