# Cosmic PDF

[简体中文](README_zh.md)

Read PDFs in Chrome with a comfortable light or dark appearance, clear rendering and local text recognition. Cosmic PDF is an independent extension developed from Cosmic Gemini's PDF Viewer.

## Reading

Open PDF links directly in Cosmic PDF, or choose a local file. Search text, navigate pages and outlines, adjust zoom, rotate left, enter full screen, print or download the original. A toolbar button returns to Chrome's PDF reader.

The reader's own extension page keeps website dark-mode extensions from applying a second theme. Light/dark appearance remains under your control.

## Local OCR

Recognize scanned pages in English, Simplified Chinese or Traditional Chinese, including mixed Chinese and English. Select and copy recognized text on the page or from the recognition panel. Recognition starts only when requested and does not upload or modify the PDF.

## Make it yours

Settings cover appearance, 1×–6× rendering quality, optional sharpening, initial zoom, page spacing, thumbnails, document links and OCR preferences. The interface supports English and Simplified Chinese.

## Install

Requires Chrome 128 or later.

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's `extension` directory.
3. Pin **Cosmic PDF** if you want quick access to the file picker. Settings are available from the reader or the extension's options menu.

To open `file://` PDF links automatically, enable **Allow access to file URLs** in Chrome's extension details, then reopen the extension or its Settings. Selecting or dropping a file works without that permission.

Automatic opening covers ordinary top-level HTTP(S) PDF responses and permitted local PDF links. Embedded readers, POST-generated documents and opaque blob links are not automatically replaced. Downloads marked as attachments retain normal download behavior. Some authenticated or single-use links may need Chrome's reader or a local copy. Files larger than 64 MB remain outside this reader's safety limit.

## Privacy and safety

Documents and recognition results stay in the open reader and are discarded when it closes. Only preferences are stored. PDF scripting, form execution, editing and remote document resources are disabled. The original file is unchanged. No parser can guarantee safety against every malformed file; keep Chrome and the extension up to date.

## Development

Run `npm test` and `npm run check`. See [technical documentation](docs/TECHNICAL.md), [browser QA](docs/QA.md) and licenses and notices bundled under [`extension/vendor/`](extension/vendor/).
