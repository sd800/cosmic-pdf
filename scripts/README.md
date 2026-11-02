# Development scripts

Run commands from the project root. `npm run check`, `npm test`, and `npm run test:browser` retain their existing roles.

| Folder | Purpose |
| --- | --- |
| `checks/` | Source, dependency, and interface validation. |
| `browser/` | Browser checks and reusable AI, toolbar, review, and PDF lifecycle helpers. |
| `build/` | Reproducible extension and source download archives. |
| `assets/` | Icon rendering and first-party brand fingerprints. |
| `vendor/` | Pinned PDF.js and OCR asset packaging, including the PDF rendering patch. |

```sh
npm run check
PDF_PLAYWRIGHT=/path/to/playwright/index.mjs PDF_CHROME=/path/to/chrome npm run test:browser
python3 scripts/build/build-downloads.py
```

Run the browser mode relevant to the change; [QA](../docs/QA.md) lists supported modes. Reusable fixtures and concise instructions belong in ignored `test-dist/`.
