# Cosmic PDF technical reference

## Authority and ownership

The project follows Cosmic Gemini's Central → Province → Product separation. `background/central.js` routes events, never parses documents. Standing Province owns automatic opening and per-tab native-reader exemptions. Operations Province owns extension administration. The reader/renderer/OCR workspace is the Customs boundary: it handles imported bytes but cannot invoke sibling products. The host exposes a small explicit command bridge, not arbitrary RPC. The three province names describe ownership, not a reason to add empty lifecycle machinery.

Preferences are normalized against a whitelist in `core/settings.js`. Unknown/deprecated fields are ignored, never migrated. Defaults are automatic appearance, 100% initial zoom, 4× sampling, sharpening off and manual English OCR. Interface languages are en-US/zh-CN. Recognition languages additionally include Traditional Chinese. Open readers snapshot rendering/OCR settings; subsequent opens/reloads use changed settings. Appearance controls change the current reader only. The full toolbar retains a fixed light/dark override and a Default reset. Compact toolbars use one button for the saved default or its opposite; Auto follows the browser in either state. Toolbar visibility changes synchronize to open readers without reparsing their PDFs; rendering/OCR preferences remain snapshots.

## PDF takeover and return

Chrome 128+ response-header declarativeNetRequest rules redirect top-level GET PDF responses to an extension page. A higher-priority allow rule preserves attachment downloads. HTML named `.pdf` does not match unless its MIME type is PDF; generic binary data requires a PDF suffix. POST bodies, embedded documents and site blob URLs are not intercepted. File URL rules require Chrome's explicit file-access permission.

A DNR regex capture cannot URL-encode its substitution. The final `?source=` value is therefore parsed as the complete raw suffix, preserving all original query parameters and fragments. Only HTTP/HTTPS/file schemes without credentials are accepted. The privileged host is top-level only, fetches the requested PDF with session credentials, enforces time/byte budgets and validates PDF magic. Fetching again can fail for one-use/authenticated endpoints; no attempt is made to replay POST requests or read browser credentials.

Native-reader requests must come from frame 0 of this extension's reader tab. Central derives the URL from the sender, installs a high-priority exact-URL tab-scoped session allow rule, then navigates. Exemptions survive PDF reloads, not tab departure/closure or browser restart. Other tabs remain unaffected. Very long unsupported regex URLs fail with guidance rather than creating a redirect loop. Local file-picker documents use a blob URL opened in a separate Chrome-reader tab while the original owner remains open.

PDF URLs remain in the reader address for reload, not in extension storage. Native exemption metadata lives in storage.session only. Local picked bytes are not persisted. Download always returns the original PDF, never the displayed dark/rotated/OCR representation.

The homepage Settings link navigates in the same tab and adds a history entry. Reader-toolbar Settings still opens separately so local file-picker documents are not lost. The PDF viewport contains vertical overscroll but leaves horizontal browser navigation enabled; Alt-key history shortcuts are not consumed. History restoration recreates a disposed renderer from in-memory bytes or its validated source URL.

Opening a PDF prepares the sandbox toolbar independently of document transfer. The shell is revealed as soon as localization, appearance and toolbar preferences are applied. Loading animates the toolbar's bottom divider without adding a status row or changing content geometry. Document-dependent controls stay disabled until usable; theme, Settings and remote-source native fallback work during transfer. A single bounded document message follows shell initialization over its private port. The bundled parser worker starts concurrently with download; optional thumbnails wait for the first page's render. Downloads still complete and pass size/magic validation before parsing (no source URL or website network capability enters the sandbox). No renderer or OCR engine starts on the empty homepage. Parsed background documents wait for visibility without a false first-paint timeout. Failures dispose the shell/worker and expose normal recovery actions.

## Isolation and document safety

The extension-origin host is outside normal website content-script matching. This is how it prevents Dark Reader and similar webpage transformations from double-applying; it never disables or changes other extensions. A `darkreader-lock` meta tag is defense in depth, not the security boundary.

An opaque manifest-sandbox iframe receives bytes once through a transferred MessagePort. It has no extension APIs, document source URL or preferences storage. Its CSP permits only bundled/blob resources, no external fetch, frames, form submission, objects or evaluated JavaScript. PDF.js scripting/XFA/form/editor/attachment layers are not enabled. Text and a bounded set of passive safe links are separate from drawing. Links accept only HTTP/HTTPS/mailto; remote document resources remain blocked. PDF copy/print restrictions are respected by the reader and OCR. No claim of absolute immunity to parser vulnerabilities is made.

The privileged bridge recognizes only readiness, fixed toolbar actions, theme/fullscreen and bounded user-requested copy text. It never accepts arbitrary URLs, file paths, API names or HTML from the sandbox. Rendering workers use packaged code, not file-supplied scripts. Dependency bytes and licenses are checked against integrity manifests.

## Rendering and resource budgets

PDF input: 64 MiB, 60-second fetch deadline, 30-second parse deadline outside password entry, at most 10,000 pages. Byte streaming is stopped on overflow. Images are capped by PDF.js. The original Blob remains only for native opening/download while the reader is open.

Sampling choices 1×–6× change backing density, not CSS zoom. Base canvases stay within min(4 Mi pixels, sampling² Mi pixels); visible detail canvases within min(36 Mi pixels, sampling² Mi pixels), maximum dimension 8,192. The inherited reproducible PDF.js patch uses exact backing/display ratios and bounded near-viewport detail. Zoom moves in ten percentage points, wheel changes are coalesced and rasterization delayed briefly; no reparse on zoom. Custom zoom labels update immediately, but their option is located between neighboring presets only on pointer/keyboard menu opening (once per changed value). Hidden tabs do not schedule normal rendering. Thumbnails are lazy, at most 24 small canvases; print is bounded to 50 pages and 64 Mi pixels per job. Default sharpening is off. Theme changes filter displayed canvases only and leave source bytes unchanged. Offscreen detail, workers, observers, blobs and print surfaces have explicit cleanup.

Document properties are imported and read only on toolbar request, with one cached metadata read per open reader. Values are bounded plain text; no metadata HTML, URLs or scripts execute. File size uses received bytes and decimal units. Page dimensions include the original PDF page rotation and UserUnit, not the temporary viewing rotation.

## OCR

Settings and the reader share allowlisted language checkboxes. At least one language remains selected; any combination of English, Simplified Chinese and Traditional Chinese is supported. Only selected models are initialized. Defaults apply to newly opened readers; per-document choices do not rewrite the saved defaults.

Tesseract runs only after the user presses Recognize. Each run handles a selected range of at most 20 pages sequentially using one LSTM worker, terminated after completion, error, cancellation or reader closure. Worker ownership starts before model loading, so Cancel is effective during initialization too. Each stage/page has a 120-second deadline. English, Simplified Chinese and Traditional Chinese models and both SIMD/non-SIMD LSTM cores are local; no cache/CDN/telemetry is used.

OCR rasterization uses the original light PDF page, independent of display sampling, with a 4 Mi pixel/4,096-axis limit. Temporary canvases are zeroed after encoding. Lightweight results are bounded to 20 pages, 50,000 word rectangles and 500,000 text characters. Word rectangles are validated and stored in PDF coordinates, enabling selectable overlays to follow zoom and rotation without rerunning recognition. The original PDF is not modified; OCR does not export a searchable PDF. The engine's worker protocol is pinned and tested; upgrades must retest initialization, recognition and cancellation.

## Repository and release standards

English/Simplified Chinese README and changelog have equivalent structure. README introduces capabilities, not a catalog of implementation rules. Technical details live here; repeatable validation lives in QA.md. `sidenote/` is ignored local continuity, not release history or distributable content. System `.DS_Store`/AppleDouble files are ignored by Git and validation. Dependencies are vendored, pinned, licensed and reproducible; no runtime remote code. No release archive is created unless requested. A new remote must be supplied explicitly; this repository must never push into Cosmic Gemini's remote by inference.

## Interface design

Use the Cosmic Gemini family palette, flat outlined icons, compact identity header and rounded cards. Settings labels/controls and OCR choices are 15px; supporting text is at least 14px, except the opening-screen copyright at 13px. Preserve contrast in both themes and reflow at narrow widths rather than shrinking type. The editable brand is `extension/icons/icon.svg`; regenerate manifest PNGs with `scripts/render-icons.mjs` using the same isolated Chrome/Playwright variables as browser QA.

Two independent toolbar-content checkboxes allow both items, branding only, filename only, or neither. Both items default to hidden; existing explicit choices remain unchanged. Selecting both restores the two-row layout and spacing. Hiding either item uses a single row when space permits and a single appearance button before Print. Filename-only mode is left aligned, bounded to 320px or available space, and ellipsized with the full name in its tooltip. Narrow windows reflow controls without reducing text or button spacing. Current and total page counts use identical centered widths based on the total page count; the slash is a separate separator.
