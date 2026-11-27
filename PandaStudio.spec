# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

added_files = [
    ('index.html', '.'),
    ('favicon.svg', '.'),
    ('config.json', '.'),
    ('css', 'css'),
    ('js', 'js'),
]

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=added_files,
    hiddenimports=['edge_tts', 'aiohttp'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'unittest', 'pydoc', 'faster_whisper', 'ctranslate2', 'onnxruntime', 'av', 'numpy', 'scipy', 'torch', 'tensorflow'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='PandaStudio',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='panda.ico',
)
