# Local OCR dependencies

Tesseract.js 6.0.1 and tesseract.js-core 6.0.0, Apache-2.0. https://github.com/naptha/tesseract.js

Browser bundles and LSTM-only SIMD/non-SIMD cores come from pinned npm tarballs. The cores have one guarded local patch (scripts/vendor-ocr.py): embedded base64 WASM uses the existing byte decoder directly, avoiding a data-URL network fetch and its CSP violation. The WASM bytes and engine behavior are unchanged. Embedded WASM avoids additional network resolution. The engine always uses OEM 1. Core legacy/OEM 0 is not supported.

English, Simplified Chinese and Traditional Chinese language data: https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd (Apache-2.0). Traineddata files are gzip-compressed with mtime=0; no data transformations. All code/models run locally and are loaded only on an explicit OCR request.

Licenses accompany engine, core and language data. integrity.json pins all distributed asset bytes. See scripts/vendor-ocr.py for reproduction.
