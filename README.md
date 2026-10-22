# <img src="extension/icons/icon-128.png" width="96" align="right" alt=""> Cosmic PDF<br clear="right">

[Simplified Chinese](README_zh.md)

Cosmic PDF is a Chrome extension for reading PDFs in dark mode, with local text recognition, AI explanations, and a customizable reading experience.

## Product statement

Cosmic PDF is built around a simple idea: **reading a PDF should be comfortable, and understanding it should be effortless.** Two common frustrations shaped its design: bright pages during night reading and interruptions when looking up unfamiliar content.

**Dark mode should make PDFs easier to read.** Most PDFs have white backgrounds, while general-purpose dark-mode extensions can distort colors, turn already-dark pages bright, and invert Chrome's PDF viewer background from dark to light. Cosmic PDF uses its own smart dark mode to adjust brightness while preserving color hues and keeping already-dark pages dark. It works as soon as a PDF opens and follows the system appearance by default.

**Getting an explanation should not interrupt reading.** Looking up an unfamiliar term often means switching to ChatGPT or Claude, copying text, providing context, and finding your place again. Cosmic PDF puts Explain with AI right beside the document, supporting follow-up questions without losing your place. On-device text recognition also makes text in scanned PDFs selectable.

**Cosmic PDF keeps the reading experience simple and flexible.** AI is optional, and people can use their own API keys or an existing ChatGPT or Claude account. PDF files remain on the device, with only selected text and optional nearby context shared for AI explanations. The goal is to help people stay focused on what they are reading.

## PDF dark mode

Read PDFs with dark pages and a dark viewer background, including scanned documents. Switch to light mode whenever you prefer, without changing the original file.

The reader uses its own extension page to avoid a second dark-mode treatment by website extensions.

## Reading tools

Open PDF links and embedded documents directly in Cosmic PDF, or choose a local file. Search text, navigate pages and outlines, adjust zoom, rotate left, enter full screen, print or download the original. You can also return to Chrome's PDF reader.

## Local OCR

Recognize scanned pages in English, Simplified Chinese or Traditional Chinese, including mixed Chinese and English. Select and copy recognized text directly on each page as recognition finishes. Choose on-demand recognition or automatic recognition of the current scanned page, independently of AI explanations. OCR does not upload or modify the PDF.

## Explain with AI

Select a passage to clarify its meaning or ask a follow-up question. Choose **Built-in AI via API** for answers inside Cosmic PDF using your own Google Gemini, OpenAI or Claude API key, or **Bring Your Own AI via Subscription** to use your existing ChatGPT or Claude website account without an API key. The website opens beside the PDF where supported, otherwise in the next tab. The sparkle switch controls the selection button. Only your chosen text and nearby context when enabled are passed along.

## Make it yours

Settings cover appearance, toolbar layout, 1×–6× rendering quality, optional sharpening, initial zoom, page spacing, thumbnails, document links, external-link capture, and OCR preferences. The interface supports English and Simplified Chinese. API users can choose a model for each service and refresh its model list in Settings.

## Install

Requires Chrome 128 or later. [Download the installation ZIP](https://cpdf.songming.org/downloads/cosmic-pdf.zip), then unzip it. The [complete source package](https://cpdf.songming.org/downloads/cosmic-pdf-source.zip) is available separately.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `extension` directory inside the unzipped package (or this repository).
3. Pin **Cosmic PDF** if you want quick access to the file picker. Settings are available from the reader or the extension's options menu.

To open `file://` PDF links automatically, enable **Allow access to file URLs** in Chrome's extension details, then reopen the PDF. Selecting or dropping a file works without that permission.

Automatic opening covers ordinary HTTP(S) PDF responses, including embedded viewers, and permitted local PDF links. POST-generated documents and opaque blob links are not automatically replaced. Downloads marked as attachments retain normal download behavior. Some authenticated or single-use links may need Chrome's reader or a local copy. Files larger than 128 MB remain outside this reader's safety limit.

## Privacy and safety

PDF reading and OCR run on this device. Documents, recognition results and built-in AI conversations stay in the open reader and are discarded when it closes; requesting an AI explanation sends the chosen text to your selected service. Website-mode conversations stay on the AI website, and their prefilled questions may appear in browser history or sync. Preferences and encrypted API keys are stored locally. Saved keys are listed by service in Settings, with individual test, replace and delete controls. AI availability, costs and data handling follow the selected provider’s terms. PDF scripting, form execution, editing and remote document resources are disabled. The original file is unchanged. Keep Chrome and Cosmic PDF up to date to receive security improvements.

See the [security policy and boundaries](docs/SECURITY.md) for injection defenses and vulnerability reporting.

## Development

Run `npm test` and `npm run check`. Before publishing an update, run `python3 scripts/build-downloads.py` and commit the regenerated `downloads/` files with the release. See [technical documentation](docs/TECHNICAL.md), [browser QA](docs/QA.md) and licenses and notices bundled under [`extension/vendor/`](extension/vendor/).
