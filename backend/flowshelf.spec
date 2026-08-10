# -*- mode: python ; coding: utf-8 -*-
"""
FlowShelf 后端 PyInstaller 打包配置。

核心体积优化策略（发布包控制在 < 200MB，远低于 GitHub 2GB 限制）：
1. 默认依赖排除 torch/sentence-transformers/transformers（可选安装）
2. 大规模 excludes：matplotlib/scipy/pandas/pytest/tkinter 等无用包
3. onefile：单文件分发，用户无需解压到固定目录
4. UPX 压缩（--best --lzma），典型再减 30-50%
5. strip=True 去掉符号表
6. 排除 torch CUDA/ROCm GPU 库（Linux torch 含 1.5GB 的 CUDA .so）

注意：若需要本地 Embedding 版本，在运行 pyinstaller 前 pip install sentence-transformers，
并移除下文中 excludes 中 'torch'/'sentence_transformers'/'transformers' 相关项，
同时加上 'torch.cuda' 的 excludedimports 来排除 CUDA 组件。
"""

block_cipher = None

a = Analysis(
    ['entrypoint.py'],
    pathex=[],
    binaries=[],
    datas=[
        # 后端 FastAPI 代码
        ('app', 'app'),
        # 前端静态文件（由 GitHub Actions 构建后复制到此处，
        # 本地调试若缺失则跳过：StaticFiles 挂载时检测 frontend_dist 是否存在）
        ('frontend_dist', 'frontend_dist') if __import__('os').path.isdir('frontend_dist') else None,
        # Prompt 模板文件（已含在 app/prompts/ 里，但显式列一份防漏）
        ('app/prompts', 'app/prompts'),
    ],
    # 去掉 sentence_transformers/torch 后，本项目不依赖这些重型库，
    # 显式 exclude 可防止 PyInstaller 通过依赖传递错误地打进来
    hiddenimports=[
        # ── FastAPI 及其依赖链 ──
        'fastapi',
        'fastapi.app',
        'fastapi.routing',
        'fastapi.middleware',
        'fastapi.middleware.cors',
        'fastapi.staticfiles',
        'fastapi.params',
        'fastapi.dependencies',
        'fastapi.encoders',
        'fastapi.exception_handlers',
        'fastapi.responses',
        'fastapi.security',
        'starlette',
        'starlette.routing',
        'starlette.middleware',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',
        'starlette.requests',
        'starlette.exceptions',
        'starlette.status',
        'starlette.convertors',
        'starlette.schemas',
        'anyio',
        'anyio._backends._asyncio',
        'sniffio',
        # ── Uvicorn ──
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.lifespan.on',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        # ── SQLAlchemy / Alembic ──
        'sqlalchemy',
        'sqlalchemy.ext.asyncio',
        'sqlalchemy.dialects.sqlite',
        'sqlalchemy.sql.default_comparator',
        'alembic',
        'aiosqlite',
        # ── Pydantic ──
        'pydantic',
        'pydantic.deprecated.decorator',
        'pydantic_settings',
        # ── OpenAI ──
        'openai',
        'httpx',
        'httpcore',
        'httpcore._async',
        'httpcore._async.connection_pool',
        # ── BeautifulSoup / lxml / trafilatura ──
        'bs4',
        'bs4.builder',
        'bs4.builder._lxml',
        'bs4.builder._htmlparser',
        'lxml',
        'lxml._elementpath',
        'lxml.etree',
        'trafilatura',
        # ── jieba ──
        'jieba',
        # ── Jinja2 ──
        'jinja2',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # ===== 体积优化：大规模排除无用包 =====
    excludes=[
        # —— 机器学习 / 重型科学计算 ——
        'torch',
        'torchvision',
        'torchaudio',
        'sentence_transformers',
        'transformers',
        'datasets',
        'accelerate',
        'scipy',
        'sklearn',
        'scikit-learn',
        'matplotlib',
        'pandas',
        'sympy',
        'numpy.f2py',            # numpy Fortran 子模块（~20MB，这里用不到）
        # —— 测试框架 ——
        'pytest',
        '_pytest',
        'unittest',
        'coverage',
        'hypothesis',
        # —— GUI / 图形 ——
        'tkinter',
        '_tkinter',
        'PyQt5',
        'PyQt6',
        'PySide2',
        'PySide6',
        'PIL.ImageQt',
        'IPython',
        'jupyter',
        'notebook',
        # —— Web 框架冗余 ——
        'flask',
        'django',
        'tornado',
        'aiohttp',
        'flask_sqlalchemy',
        # —— 数据库冗余 ——
        'psycopg2',
        'MySQLdb',
        'mysql',
        'cx_Oracle',
        'pymongo',
        'redis',
        # —— 异步任务 / 消息队列 ——
        'celery',
        'kombu',
        'amqp',
        'kafka',
        # —— 云 SDK（用户可选，非默认）——
        'boto3',
        'botocore',
        's3transfer',
        'azure',
        'google.cloud',
        # —— 图像 / 视频 ——
        'cv2',
        'PIL',
        'moviepy',
        'imageio',
        # —— 音频 ——
        'soundfile',
        'librosa',
        'pydub',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# 再次过滤：二进制中去掉 CUDA / GPU 相关 .so/.dll（体积大头）
def _is_gpu_binary(filename):
    """判断二进制是否是 GPU 相关，匹配则排除"""
    if not filename:
        return False
    f = filename.lower()
    gpu_terms = [
        'cuda', 'cudnn', 'nvrtc', 'cublas', 'cusparse', 'cufft', 'curand',
        'cusolver', 'nvtx', 'nvidia', 'libnv', 'ptx', 'rocm', 'amdhip', 'migraphx',
        'libtorch_cuda', 'libtorch_hip',
    ]
    return any(t in f for t in gpu_terms)

a.binaries = [b for b in a.binaries if not _is_gpu_binary(b[0])]

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
    strip=True,          # 去掉符号表，典型减 10-30MB
    upx=True,            # UPX 压缩（--best --lzma 在 actions 里额外调用，这里启用压缩）
    upx_exclude=[
        # UPX 对 DLL 压缩后可能在某些 Windows 机器上加载失败，排除常见敏感库
        'python*.dll',
        'libcrypto*.so',
        'libssl*.so',
        'msvcp*.dll',
        'vcruntime*.dll',
    ],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
