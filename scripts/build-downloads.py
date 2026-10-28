#!/usr/bin/env python3
"""Build reproducible static download packages from tracked project files.

Run locally before publishing a release. No GitHub Actions, API token or remote
request is involved. The existing main-branch Pages site serves downloads/.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'downloads'
EXCLUDED_ROOTS = {'.git', 'dist', 'test-dist', 'node_modules', 'downloads', 'coverage'}


def tracked_sources():
    result = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True)
    ignored = subprocess.run(['git', 'check-ignore', '--no-index', '-z', '--stdin'],
                             cwd=ROOT, input=result.stdout, capture_output=True)
    if ignored.returncode not in (0, 1):
        raise RuntimeError('Could not verify Git exclusions before packaging')
    ignored_files = set(ignored.stdout.decode().split('\0'))
    files = []
    for raw in result.stdout.decode().split('\0'):
        if not raw:
            continue
        rel = PurePosixPath(raw)
        if rel.is_absolute() or '..' in rel.parts:
            raise ValueError('Unsafe tracked path')
        if rel.parts[0] in EXCLUDED_ROOTS or raw in ignored_files:
            continue
        if any(part == '.DS_Store' or part.startswith('._') or part.startswith('.env') for part in rel.parts):
            continue
        path = ROOT.joinpath(*rel.parts)
        if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(ROOT):
            raise ValueError('Tracked source is missing or not a regular local file: ' + raw)
        files.append(raw)
    return sorted(files)


def make_archive(name, prefix, files):
    fd, temporary = tempfile.mkstemp(prefix='.package-', suffix='.zip', dir=OUTPUT)
    os.close(fd)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for rel in files:
                info = zipfile.ZipInfo(prefix + '/' + rel, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, (ROOT / rel).read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert all(PurePosixPath(n).parts[1] not in EXCLUDED_ROOTS for n in archive.namelist())
            packaged = json.loads(archive.read(prefix + '/extension/manifest.json'))
            assert packaged['version'] == VERSION
        os.replace(temporary, OUTPUT / name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    path = OUTPUT / name
    return {'url': 'https://cpdf.songming.org/downloads/' + name,
            'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


if __name__ == '__main__':
    manifest = json.loads((ROOT / 'extension/manifest.json').read_text())
    VERSION = manifest['version']
    assert json.loads((ROOT / 'package.json').read_text())['version'] == VERSION
    sources = tracked_sources()
    assert 'LICENSE' in sources
    extension = ['LICENSE', *[name for name in sources if name.startswith('extension/')]]
    assert 'extension/manifest.json' in extension and 'scripts/build-downloads.py' in sources
    OUTPUT.mkdir(exist_ok=True)
    packages = {
        'extension': make_archive('cosmic-pdf.zip', 'cosmic-pdf', extension),
        'source': make_archive('cosmic-pdf-source.zip', 'cosmic-pdf-source', sources),
    }
    data = {'version': VERSION, 'minimumChromeVersion': manifest['minimum_chrome_version'], 'packages': packages}
    (OUTPUT / 'latest.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (OUTPUT / 'SHA256SUMS').write_text(''.join(item['sha256'] + '  ' + Path(item['url']).name + '\n' for item in packages.values()))
    print(json.dumps(data, indent=2))
