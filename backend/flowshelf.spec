# -*- mode: python ; coding: utf-8 -*-
"""
FlowShelf 后端 PyInstaller 打包配置

使用方法：
  cd backend
  pyinstaller flowshelf.spec

产物：dist/flowshelf-backend（单文件可执行）
"""

block_cipher = None

a = Analysis(
    ['entrypoint.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('app', 'app'),
        ('frontend_dist', 'frontend_dist'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.lifespan.on',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.websockets',
        'anyio._backends._asyncio',
        'sentence_transformers',
        'transformers',
        'torch',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='flowshelf-backend',
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
)
