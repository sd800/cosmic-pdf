# Verification

Run `npm test` for settings, URL handling, takeover/native exemptions, OCR geometry/cancellation and resource limits. Run `npm run check` for syntax, manifests, bilingual version entries and third-party integrity.

Run `PDF_CHROME=/path/to/chrome PDF_PLAYWRIGHT=/path/to/playwright/index.mjs npm run test:browser` for integration checks. This uses its own temporary Chrome profile and local authored PDFs, never a user's open tabs. No fixture contains private documents. Screenshots and metrics are written outside the repository.

The integration suite exercises response-based takeover, signed query preservation, attachment and HTML exceptions, native-reader return, local opening, initial zoom, zoom steps, dark appearance, OCR recognition/cancellation, settings snapshotting and sandbox network isolation. Also check real documents with mixed fonts, scanned pages, passwords, outlines, large images and page sizes. Check 1×/4×/6× at ordinary and high zoom, scrolling, keyboard search, print range validation, disabled sharpening, and visible paper edges in both themes.

Manually verify Chrome printing UI, file permission toggles, attachment save-dialog preferences, authenticated PDFs on representative sites and fullscreen on the target OS. The automated suite also covers fullscreen, 6× high zoom and OCR worker release. Automatic takeover cannot cover every endpoint; native fallback and file selection must stay available after errors.

Do not convert unit-test passing into a claim that every website or PDF works. Browser automation runs only in an isolated temporary profile unless the user explicitly requests their live Chrome.

UI regression checks cover Settings and reader language checkboxes, combined recognition, persistence, last-selection protection, preference snapshotting, minimum font sizes, dark text contrast and narrow layout. Visually inspect both languages and light/dark screenshots after icon or layout changes.

Navigation/loading regressions include same-tab homepage Settings and Back/Forward, website → PDF → Back → Forward, a deliberately delayed response with an immediately usable toolbar in both themes, its divider loading indicator, disabled document controls, parser-worker preparation during transfer, and unchanged toolbar height after first paint. Page counts are checked for equal widths and stable spacing across digit changes. Invalid bytes and parser errors must dispose the shell and show recovery actions. Toolbar regressions cover all four checkbox combinations, live synchronization without document reparse, persistence, long filenames, narrow widths, and the full/compact appearance controls. Physical macOS trackpad history gestures still require manual OS-level verification; automated checks cover history entries, unconsumed shortcuts, and horizontal scrolling/overscroll policy.

Document properties checks use an authored PDF with known metadata: verify Print → Document properties → Settings ordering, lazy module/metadata reads, plain-text handling of markup-like fields, decimal size, dates, PDF version, dimensions, empty fields, cached reopening, English/Chinese labels, and narrow-window reflow. Toolbar actions must not overlap the reading controls at layout breakpoints.
