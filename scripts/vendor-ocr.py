#!/usr/bin/env python3
"""Reproduce offline assets from unpacked pinned packages and raw traineddata.
Usage: python3 scripts/vendor-ocr.py /path/tesseract.js/package /path/core/package /path/tessdata_fast
Download sources from extension/vendor/tesseract/NOTICE.md. No package code executes.
"""
import sys,json,gzip,hashlib,shutil
from pathlib import Path
engine,core,data=map(Path,sys.argv[1:4]);target=Path('extension/vendor/tesseract')
for folder,name,version in [(engine,'tesseract.js','6.0.1'),(core,'tesseract.js-core','6.0.0')]:
 package=json.loads((folder/'package.json').read_text())
 if package['name']!=name or package['version']!=version:raise ValueError('Unexpected OCR package')
for folder in [target,target/'core',target/'lang']:folder.mkdir(parents=True,exist_ok=True)
shutil.copyfile(engine/'dist/worker.min.js',target/'worker.min.js')
shutil.copyfile(engine/'dist/worker.min.js.LICENSE.txt',target/'worker.min.js.LICENSE.txt')
shutil.copyfile(engine/'LICENSE.md',target/'LICENSE')
shutil.copyfile(core/'LICENSE',target/'core/LICENSE')
# Pinned glue: decode the embedded WASM directly, without a data-URL fetch/XHR
# that conflicts with the reader's deliberately local-only connect-src policy.
for name in ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js']:
 source=(core/name).read_text()
 needle='function Na(a){'
 if source.count(needle)!=1:raise ValueError('Unexpected WASM loader')
 (target/'core'/name).write_text(source.replace(needle,'function Na(a){if(a.startsWith("data:application/octet-stream;base64,"))return Promise.resolve().then(()=>Ma(a));'))
shutil.copyfile(data/'LICENSE',target/'lang/LICENSE')
for lang in ['eng','chi_sim','chi_tra']:(target/'lang'/(lang+'.traineddata.gz')).write_bytes(gzip.compress((data/(lang+'.traineddata')).read_bytes(),mtime=0))
files={str(p.relative_to(target)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(target.rglob('*')) if p.is_file() and p.name not in ['NOTICE.md','integrity.json']}
(target/'integrity.json').write_text(json.dumps(files,indent=2)+'\n')
