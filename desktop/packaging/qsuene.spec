# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files


ffmpeg_bin = os.environ.get(
    'QSUENE_FFMPEG_BIN',
    os.path.expanduser('~/scoop/apps/ffmpeg/current/bin'),
)
ffmpeg_exe = os.path.join(ffmpeg_bin, 'ffmpeg.exe')
ffprobe_exe = os.path.join(ffmpeg_bin, 'ffprobe.exe')
if not os.path.isfile(ffmpeg_exe) or not os.path.isfile(ffprobe_exe):
    raise SystemExit(
        'FFmpeg no encontrado. Configure QSUENE_FFMPEG_BIN con el directorio que contiene ffmpeg.exe y ffprobe.exe.'
    )

a = Analysis(
    ['../app/main.py'],
    pathex=[],
    binaries=[
        (ffmpeg_exe, 'tools'),
        (ffprobe_exe, 'tools'),
    ],
    datas=[
        ('../frontend/dist', 'frontend/dist'),
        ('../app/icon.ico', 'app'),
        ('../app/logo.svg', 'app'),
    ] + collect_data_files('pykakasi'),
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='QSuene',
    icon='../app/logo.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
