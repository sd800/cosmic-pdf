# Changelog

## 2.1.2

- Extend external-link capture to application protocols, with an explicit Open application/Copy prompt. Email, telephone, and SMS links remain copy-only.
- Unify the underlying protocol parsing and confirmation components.

## 2.1.1

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

## 1.2.15

- Add a default-on Preserve dark-paper colors setting to preserve original colors when strictly recognized black or gray paper would otherwise become brighter in dark mode, while keeping white-paper and mixed layouts under normal dark-mode processing. Reuse per-page decisions during zooming and rotation.

## 1.2.13

- Slightly narrow the toolbar filename while preserving its size, ellipsis and document properties shortcut.

## 1.2.12

- Open Document properties by clicking the regular-weight toolbar filename, and make properties dialogs more compact without reducing text size. Overflowing dialogs open at the top.
- Let More actions close when its button is clicked again, and keep hidden controls consistent across toolbar layouts.
- Use one light/dark appearance button in every layout and place Chrome reader in More actions by default.
- Keep Pages and outline at the left edge, alongside a sole branding or filename and on the second row when both are shown.

## 1.2.11

- Make the reader’s Find button always open built-in search, independently of the Chrome Find shortcut preference, and remove shortcut banners.
- Highlight PDF search matches in orange and simplify the Chrome Find setting description.
- Abbreviate document-property time zones, keeping minutes only for non-whole-hour offsets.

## 1.2.10

- Refine the Document properties information icon’s proportions and spacing.

## 1.2.9

- Use a plain information icon for Document properties in the PDF reader.

## 1.2.8

- Update the PDF reader’s Rotate left icon to a rounded square with a counterclockwise arrow, aligned with the other toolbar icons.

## 1.2.7

- Align the Document properties date-format dropdown with other settings and prevent oversized dropdowns from overflowing narrow cards.

## 1.2.6

- Add customizable Document properties date formats, spaced Chinese dates, and source time zones and seconds when available. Allow clicking outside the dialog to close it.
- Apply interface-language changes immediately to open readers and Settings pages.
- Show OCR results directly as selectable page text, with each page ready as soon as it is recognized.
- Default Text recognition to the current page, with choices for the current page and next 5/10 pages or the side panel; hold the button to open the panel from a direct-recognition mode.
- Enable English and Simplified Chinese recognition by default and improve spacing when copying recognized Chinese text.
- Use Chrome for ⌘F/Ctrl+F by default, with a Settings switch to use Cosmic PDF search instead.
- Size More actions to its contents, simplify Find labels and the Properties menu label, and mark default-hidden controls in Settings.

## 1.2.5

- Let toolbar controls move into an icon-labeled More actions menu through Settings, with immediate updates to open readers.
- Simplify the toolbar when filename and branding are hidden, including moving Previous/next page into the menu while retaining the page counter and keeping Pages and outline at the left.
- Use a compact percentage input when fit controls are moved into the menu; accept values with or without `%`.
- Open reader Settings immediately to the right of the current PDF tab.
- Keep compact toolbars on one row whenever their visible controls fit, and reduce the README heading logo size.

## 1.2.3

- Show the toolbar immediately while opening a PDF, with loading progress in its bottom divider instead of a separate loading screen.
- Add an on-demand Document properties dialog between Print and Settings.
- Prepare the PDF parser during download and prioritize the first page over optional thumbnails.
- Give current and total page counts equal, centered widths, and place custom zoom values between their neighboring presets.
- Hide the filename and Cosmic PDF branding by default while preserving saved choices.

## 1.2.2

- Tighten spacing within the page-navigation and zoom controls while preserving button sizes and other toolbar spacing.

## 1.2.1

- Simplify PDF loading to the Cosmic PDF logo, name, and progress bar, and prepare the reader while the file loads.
- Open homepage Settings in the same tab and improve browser Back/Forward navigation from the PDF reader.
- Add independent toolbar checkboxes for the filename and Cosmic PDF branding, including the option to hide both. Changes also apply to open readers.
- Use a compact layout with a single appearance button when either item is hidden, while preserving the original two-row controls when both are shown.
- Mark default appearance, reading, and OCR dropdown choices, and refine the README presentation and extension description.

## 1.1.6

- Set the opening-screen copyright to 13px and center it vertically between the file hint and the card border.

## 1.1.5

- Adjust the Open PDF buttons on the opening screen and Settings page to 14px, and add a copyright line beneath the opening-screen hint.

## 1.1.3

- Set a 14px minimum for Cosmic PDF interface text, simplify the reader wordmark, and add a copyright line at the lower right of Settings.

## 1.1.2

- Align Settings, the opening screen and reader controls with Cosmic Gemini’s visual style, with a new document icon and clearer UI typography.
- Replace OCR language presets with independent English, Simplified Chinese and Traditional Chinese checkboxes.

## 1.1.1

- Introduce Cosmic PDF, an independent Chrome PDF reader derived from Cosmic Gemini.
- Add automatic opening of supported PDFs, light/dark themes and a return-to-Chrome-reader control.
- Add offline English, Simplified Chinese and Traditional Chinese OCR with selectable and copyable results.
- Provide reading, rendering and OCR preferences in English and Simplified Chinese.
