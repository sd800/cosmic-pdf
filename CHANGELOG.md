# Changelog

## 26.11.7.1 (66) — 2026-11-07

- Add Original to the All pages and Current page appearance menus. Keep the PDF's source colors while allowing the reader interface to follow the system appearance.
- Let PDF pages and thumbnails inherit the document's appearance. Keep their colors in sync when switching system appearance, navigating to reattached pages, or creating new thumbnails, while honoring explicit per-page overrides.

## 26.11.4.1 (65) — 2026-11-04

- Expand the custom appearance menu into All pages and Current page sections, each offering Auto, Light, and Dark. Current-page Auto follows the document; All pages Auto follows the system.
- Keep page overrides in memory for the open PDF, retain them across navigation and global appearance changes, and synchronize thumbnail colors without reparsing or moving the document. Apply dark-paper preservation to individually darkened pages as well.
- Keep right-click and keyboard appearance choices available when the appearance button moves into More actions in compact or embedded toolbars.

## 26.11.3.1 (64) — 2026-11-03

- Add the cumulative release number to displayed versions, extension and project metadata, and release records. Keep the four-part calendar version in the machine-readable version field.

## 26.11.2.2 — 2026-11-02

- Use Chrome's native PDF MIME stream on supported versions to keep the original document address in the address bar. Read the browser's response once, including POST-generated, local, and embedded PDFs, while retaining the existing redirect route for older Chrome and compatible MIME variants.
- Keep Open in Chrome PDF viewer in the same original-address tab by handing the RAM copy to Chrome's built-in reader. Preserve the current page and the tab's native-reader choice across reloads, without another website request during the handoff. Continue using Chrome's original-file printing pipeline.
- Preserve authenticated AI access from native reader frames, apply source page-fragment changes without reparsing, and keep embedded toolbars in their existing compact layout. Distinguish AI companion-tab loading from source-reader disposal.
- Validate browser-supplied source and stream identities, retain bounded session ownership, and release reader work on navigation. Keep PDF contents in memory and retain file selection, recovery actions, and the automatic-opening switch.

## 26.11.2.1 — 2026-11-02

- Organize development scripts into build, checks, browser, asset, and vendor folders. Update package commands, fixture imports, generated-file notices, and documentation to use the new paths.

## 26.11.1.1 — 2026-11-01

- Remove the Cosmic PDF branding option and its toolbar layouts, retaining the optional filename display.
- Hide Full screen in embedded readers and other unavailable contexts, including its More actions entry.
- Keep embedded toolbars on one row by moving controls into More actions only when needed. AI remains visible when it fits; on overflow it moves first, followed by Rotate left, text recognition, zoom buttons, Pages and outline, appearance, and the filename.
- Preserve the zoom percentage until the final compact tiers, then prioritize page counts, More actions, and Download. Move Download into the menu only when those three cannot fit, and restore controls as space returns without changing saved preferences.

## 26.10.31.1 — 2026-10-31

- Keep the reader's address stable when reopening, duplicating, or restoring PDF tabs across browser sessions, while using a separate temporary entry for automatic opening.
- Apply page-number link changes to the document already open, including changes received during loading and browser Back/Forward navigation, without downloading or parsing it again.
- Clean up loading state and temporary request headers when an embedded PDF frame is removed or the reader closes, and cancel outdated Chrome-reader or AI-website handoffs when the source page changes.
- Adopt calendar versioning in the form YY.M.D.NUM, with a sequential revision number for each day.

## 3.2.32 — 2026-10-31

- Allow PDF addresses selected as plain text to open through Chrome's Go to command instead of being blocked during automatic reader takeover.
- Refresh PDF-opening rules after Chrome restarts or the extension reloads, preserving full document query parameters and page fragments.
- Keep reader identity consistent when returning to Chrome's viewer or opening the AI companion page.
- Require Chrome 130 or later for the updated reader entry.

## 3.2.31 — 2026-10-28

- License the project under MIT.

## 3.2.30 — 2026-10-25

- Preserve verified dark-paper PDFs with colored or gradient image backgrounds instead of turning them bright in dark mode.
- Prepare nearby pages in the scrolling direction and retain more lightweight page previews, reducing loading gaps during fast scrolling while keeping detailed rendering focused on the visible area.

## 3.2.29 — 2026-10-25

- Improve internal request validation and security safeguards.

## 3.2.28 — 2026-10-22

- Remove dedicated image- and video-generation models from both freshly fetched and previously saved model lists, keeping explanation choices focused on text-capable models.

## 3.2.27 — 2026-10-21

- Choose and save a separate API model for Google Gemini, OpenAI, and Anthropic Claude, with the existing models retained as initial choices.
- Fetch the latest model list manually and open all eligible returned choices in the provider's own order. Mark Flash-Lite, Luna, and Haiku families as recommended without automatically changing the selection.
- Keep the previous successful list and selected model when a refresh fails or is cancelled, and identify a saved model that is no longer in the returned list.
- Use consistent custom dropdown menus throughout Settings, with aligned panels, keyboard navigation, and clearer service/key/model setup.

## 3.2.26 — 2026-10-21

- Display existing annotations, markup, and filled form appearances in pages and thumbnails. Show a toolbar switch when these are detected, allowing them to be hidden for the current reader without changing the PDF.
- Print the original PDF through Chrome and the operating system, preserving original detail and removing the reader's raster-print page limit. The annotation visibility switch does not alter printed or downloaded originals.
- Open page-number links at their requested destination, with out-of-range values clamped to the document.
- Raise the file limit to 128 MB and replace the fixed download deadline with a timeout renewed while bytes continue arriving, improving slow transfers.
- Improve protected PDF loading with a temporary, narrowly scoped source-origin Referer for the reader's document request.

## 3.2.25 — 2026-10-21

- Refine public documentation and repository maintenance.

## 3.2.23 — 2026-10-21

- Improve security documentation and public guidance.

## 3.2.22 — 2026-10-20

- Add a product statement to the English and Simplified Chinese READMEs.

## 3.2.21 — 2026-10-20

- Preserve native modified-arrow and Home/End text-selection shortcuts, and leave typing and IME composition unaffected by page navigation.
- Allow a local-file retry after selecting the same file again, and stop obsolete thumbnail and print work when the reader is hidden, rotated, or closed.
- Keep the host background synchronized with the selected appearance and prevent delayed dialogs, rendering results, or channel replies from updating a closed reader.

## 3.2.20 — 2026-10-19

- Simplify the automatic text recognition setting description.

## 3.2.19 — 2026-10-19

- Open supported PDFs inside webpage frames, embedded viewers, and object elements in Cosmic PDF, retaining the original embedded position and Chrome-reader fallback.
- Improve opening downloaded and local PDFs through Chrome when the extension has file access.
- Add an independent automatic-recognition option for a current page without a text layer. It works with Explain with AI off and does not require an AI account or API key.

## 3.2.18 — 2026-10-17

- Add a right-click appearance menu with Auto, Light, and Dark choices, while keeping one-click switching.

## 3.2.17 — 2026-10-17

- Add a subtle divider below the AI model and status row, with matching model and status text sizes.

## 3.2.16 — 2026-10-17

- Add a local AI test model, toggled with 1 in Settings, with local streaming explanations and varied follow-up samples without API calls.
- Show code or table samples only when the follow-up requests their corresponding keywords.
- Keep test mode until manually turned off and mark it beside the Settings footer version.
- Simplify the AI service information in Settings.

## 3.2.15 — 2026-10-17

- Add a subtle divider above the AI follow-up area.

## 3.2.13 — 2026-10-17

- Render common Markdown in API explanations, including emphasis, headings, lists, quotes, code, and tables, while keeping HTML inert and external content unloaded.
- Keep lists and nested formatting compact in the narrow AI panel, avoiding unnecessary indentation and allowing wide code and tables to scroll locally.
- Tighten the space above Include nearby paragraphs.

## 3.2.12 — 2026-10-17

- Update the OpenAI API option to GPT-6 Luna for explanations and connection tests, preserving saved keys.

## 3.2.11 — 2026-10-17

- Align the concise completion status to the right of the AI model name and tighten nearby-context control spacing.

## 3.2.10 — 2026-10-17

- Start API explanations at the answer opening and follow-ups at the question, without automatic scrolling as replies stream.
- Make the brief AI accuracy reminder smaller with tighter line spacing.

## 3.2.9 — 2026-10-17

- Simplify the API explanation panel by removing the selected-passage preview and repeated provider notice, and shorten the smaller AI accuracy reminder.

## 3.2.8 — 2026-10-14

- Add direct installation and source downloads with reproducible local packaging.

## 3.2.7 — 2026-10-14

- Clean up repository maintenance files.

## 3.2.6 — 2026-10-13

- Enable Include nearby paragraphs by default while preserving existing saved preferences.

## 3.2.5 — 2026-10-13

- Update Google Gemini to Gemini 3.5 Flash-Lite for explanations and connection tests, with compatible request settings and existing saved keys preserved.

## 3.2.4 — 2026-10-13

- Redesign saved API keys as per-service rows with separate add/replace inputs, connection testing, Stop, and individual deletion.
- Remove the bulk-delete button and clear the encryption root when the final saved key is deleted.
- Use compact non-streaming connection checks and distinguish key, project, model, quota, network, and service errors without exposing provider details.

## 3.2.3 — 2026-10-13

- Clear PDF text selection when clicking elsewhere or changing focus, including split-view reading, while preserving the selected text needed for an AI handoff and native copy gestures.
- Use explicitly recognized text for both the AI selection and nearby paragraphs, excluding the superseded original text layer from context.
- When AI explanations are usable, automatically recognize the stable current page if it has no text layer. Keep this work bounded, cancellable, and subordinate to manual recognition.

## 3.2.2 — 2026-10-13

- Remove the AI toolbar button’s background while retaining its neutral icon and off-state indicator.
- Make AI explanations adapt to keywords and longer selections without a fixed answer template, and phrase requests naturally from the reader’s perspective.

## 3.2.1 — 2026-10-13

- Add Bring Your Own AI via Subscription for existing ChatGPT and Claude accounts alongside Built-in AI via API, with radio choices and ChatGPT website mode initially selected.
- Open a prefilled question beside the PDF when Chrome supports split view, otherwise use an adjacent tab. Reuse the PDF's companion tab for later questions.
- Keep complete longer questions available for copying when they exceed the handoff link limit, and preserve existing API keys and preferences.

## 3.1.1 — 2026-10-13

- Add AI explanations for selected PDF and recognized text, with streamed answers, optional nearby context, and follow-up questions.
- Add a neutral sparkle switch in the reader and bilingual AI settings for Google Gemini, OpenAI, and Claude.
- Encrypt saved API keys on this device and provide confirmed deletion of one service’s key or all local keys.
- Separate untrusted document text from AI instructions and keep responses as inert text.

## 2.3.5 — 2026-09-29

- Show the original file URL below the file name in PDF Document properties.

## 2.3.3 — 2026-09-28

- Keep favicons and page branding in sync with the current extension icon, and show the installed version in Settings.

## 2.3.2 — 2026-09-28

- Highlight PDF dark-mode reading in the project introduction and extension description.

## 2.3.1 — 2026-09-25

- Keep pending Settings edits consistent through language changes, rapid input, and delayed storage replies, so an older save does not overwrite a newer choice.
- Recover cleanly when returning to Chrome's PDF reader and release temporary reader resources after cancellation or departure.
- Validate page numbers and handle cancelled dialogs and keyboard input without applying delayed actions to a closed reader.

## 2.2.2 — 2026-09-24

- Use a lighter blue extension icon to make Cosmic PDF easier to distinguish in the browser toolbar.

## 2.2.1 — 2026-09-24

- Improve recognized-text selection with continuous text rows, more consistent word spacing, and stable selection after zooming or rotating.

## 2.1.5 — 2026-09-23

- Prioritize newly recognized text after manual OCR and exclude the original text layer from browser Find and selection to avoid duplicate matches.
- Preserve original text when recognition returns no text, and restore it when results are cleared.

## 2.1.3 — 2026-09-23

- Reduce extension permissions while retaining automatic PDF opening and native-reader fallback.
- Save original PDFs through ordinary browser downloads, following Chrome’s download preferences without download-management access.

## 2.1.2 — 2026-09-23

- Extend external-link capture to application protocols, with an explicit Open application/Copy prompt. Email, telephone, and SMS links remain copy-only.
- Unify the underlying protocol parsing and confirmation components.

## 2.1.1 — 2026-09-23

- Avoid OCR WASM loading warnings without expanding network access.
- Place the product name above Settings and add matching tool icons and muted default-hidden notes to More actions choices.
- Fix PDF background-worker startup and whole-document copying in the isolated reader, and avoid cross-frame dialog autofocus.
- Remove page-interior loading symbols while scrolling; show a toolbar-divider progress line only when a visible page needs longer to render.
- Improve dark-paper recognition for dense text, colored callouts, and inset images using existing page-rendering evidence, while retaining conservative protection for white paper and light content panels.
- Hide Preserve dark-paper colors when Appearance is set to Light, retaining its saved preference when returning to Auto or Dark.
- Show Filename by default in Toolbar content, without changing existing saved choices.
- Keep only the newest Settings tab open, automatically closing earlier Settings tabs without affecting PDF readers.
- Return from Settings to Open a PDF in the same tab.
- Add a default-on Capture external links setting: document and outline web links show an Open/Copy prompt, with direct opening available when capture is off. Email/telephone/SMS links always offer copying only.

## 1.2.15 — 2026-09-23

- Add a default-on Preserve dark-paper colors setting to preserve original colors when strictly recognized black or gray paper would otherwise become brighter in dark mode, while keeping white-paper and mixed layouts under normal dark-mode processing. Reuse per-page decisions during zooming and rotation.

## 1.2.13 — 2026-09-23

- Slightly narrow the toolbar filename while preserving its size, ellipsis, and document properties shortcut.

## 1.2.12 — 2026-09-23

- Open Document properties by clicking the regular-weight toolbar filename, and make properties dialogs more compact without reducing text size. Overflowing dialogs open at the top.
- Let More actions close when its button is clicked again, and keep hidden controls consistent across toolbar layouts.
- Use one light/dark appearance button in every layout and place Chrome reader in More actions by default.
- Keep Pages and outline at the left edge, alongside a sole branding or filename and on the second row when both are shown.

## 1.2.11 — 2026-09-23

- Make the reader’s Find button always open built-in search, independently of the Chrome Find shortcut preference, and remove shortcut banners.
- Highlight PDF search matches in orange and simplify the Chrome Find setting description.
- Abbreviate document-property time zones, keeping minutes only for non-whole-hour offsets.

## 1.2.10 — 2026-09-23

- Refine the Document properties information icon’s proportions and spacing.

## 1.2.9 — 2026-09-23

- Use a plain information icon for Document properties in the PDF reader.

## 1.2.8 — 2026-09-23

- Update the PDF reader’s Rotate left icon to a rounded square with a counterclockwise arrow, aligned with the other toolbar icons.

## 1.2.7 — 2026-09-23

- Align the Document properties date-format dropdown with other settings and prevent oversized dropdowns from overflowing narrow cards.

## 1.2.6 — 2026-09-23

- Add customizable Document properties date formats, spaced Chinese dates, and source time zones and seconds when available. Allow clicking outside the dialog to close it.
- Apply interface-language changes immediately to open readers and Settings pages.
- Show OCR results directly as selectable page text, with each page ready as soon as it is recognized.
- Default Text recognition to the current page, with choices for the current page and next 5/10 pages or the side panel; hold the button to open the panel from a direct-recognition mode.
- Enable English and Simplified Chinese recognition by default and improve spacing when copying recognized Chinese text.
- Use Chrome for ⌘F/Ctrl+F by default, with a Settings switch to use Cosmic PDF search instead.
- Size More actions to its contents, simplify Find labels and the Properties menu label, and mark default-hidden controls in Settings.

## 1.2.5 — 2026-09-23

- Let toolbar controls move into an icon-labeled More actions menu through Settings, with immediate updates to open readers.
- Simplify the toolbar when filename and branding are hidden, including moving Previous/next page into the menu while retaining the page counter and keeping Pages and outline at the left.
- Use a compact percentage input when fit controls are moved into the menu; accept values with or without `%`.
- Open reader Settings immediately to the right of the current PDF tab.
- Keep compact toolbars on one row whenever their visible controls fit, and reduce the README heading logo size.

## 1.2.3 — 2026-09-23

- Show the toolbar immediately while opening a PDF, with loading progress in its bottom divider instead of a separate loading screen.
- Add an on-demand Document properties dialog between Print and Settings.
- Prepare the PDF parser during download and prioritize the first page over optional thumbnails.
- Give current and total page counts equal, centered widths, and place custom zoom values between their neighboring presets.
- Hide the filename and Cosmic PDF branding by default while preserving saved choices.

## 1.2.2 — 2026-09-23

- Tighten spacing within the page-navigation and zoom controls while preserving button sizes and other toolbar spacing.

## 1.2.1 — 2026-09-23

- Simplify PDF loading to the Cosmic PDF logo, name, and progress bar, and prepare the reader while the file loads.
- Open homepage Settings in the same tab and improve browser Back/Forward navigation from the PDF reader.
- Add independent toolbar checkboxes for the filename and Cosmic PDF branding, including the option to hide both. Changes also apply to open readers.
- Use a compact layout with a single appearance button when either item is hidden, while preserving the original two-row controls when both are shown.
- Mark default appearance, reading, and OCR dropdown choices, and refine the README presentation and extension description.

## 1.1.6 — 2026-09-23

- Set the opening-screen copyright to 13px and center it vertically between the file hint and the card border.

## 1.1.5

- Adjust the Open PDF buttons on the opening screen and Settings page to 14px, and add a copyright line beneath the opening-screen hint.

## 1.1.3

- Set a 14px minimum for Cosmic PDF interface text, simplify the reader wordmark, and add a copyright line at the lower right of Settings.

## 1.1.2

- Align Settings, the opening screen, and reader controls with Cosmic Gemini’s visual style, with a new document icon and clearer UI typography.
- Replace OCR language presets with independent English, Simplified Chinese, and Traditional Chinese checkboxes.

## 1.1.1

- Introduce Cosmic PDF, an independent Chrome PDF reader derived from Cosmic Gemini's PDF Viewer feature.
- Add automatic opening of supported PDFs, light/dark themes, and a return-to-Chrome-reader control.
- Add offline English, Simplified Chinese, and Traditional Chinese OCR with selectable and copyable results.
- Provide reading, rendering, and OCR preferences in English and Simplified Chinese.
