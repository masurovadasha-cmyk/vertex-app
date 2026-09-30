"""Package the verified development build; never publish or deploy it."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.vision-build'
NAME = 'Vertex-Vision-0.2.0-dev'
PACKAGE = OUT / NAME
DELIVERABLES = OUT / 'deliverables'
EXCLUDED_SUFFIXES = {'.ttf', '.otf', '.woff', '.woff2', '.eot', '.ttc', '.pem', '.key', '.keystore', '.jks', '.apk', '.zip'}
if PACKAGE.exists():
    shutil.rmtree(PACKAGE)
shutil.copytree(OUT / 'portable', PACKAGE)
DELIVERABLES.mkdir(parents=True, exist_ok=True)

# Current committed source, not an old screenshot or a worktree containing credentials.
source_files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
excluded = []
for relative in filter(None, source_files):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts:
        raise RuntimeError('Unsafe repository path')
    if path.suffix.lower() in EXCLUDED_SUFFIXES or any(p in {'.git', '.data', '.wrangler', 'node_modules'} for p in path.parts) or path.name in {'.env', '.dev.vars', 'local.properties'}:
        excluded.append(relative)
        continue
    original = ROOT / path
    if not original.is_file():
        continue
    target = PACKAGE / 'source' / path
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(original, target)

# Include generated Android sources as well as the generator in source/.
shutil.copytree(OUT / 'android', PACKAGE / 'android-source', ignore=shutil.ignore_patterns('build', '.gradle', 'local.properties'))
shutil.copytree(OUT / 'staging-worker', PACKAGE / 'staging-worker')
shutil.copytree(OUT / 'evidence', PACKAGE / 'evidence')
backend = PACKAGE / 'server-runtime' / 'vision'
for folder in ['backend', 'database', 'contracts', 'module-sdk', 'modules']:
    shutil.copytree(ROOT / 'vision' / folder, backend / folder)
for filename in ['package.json', 'README.md', 'STAGING.md', 'PERMISSIONS.md', 'wrangler.jsonc']:
    shutil.copy2(ROOT / 'vision' / filename, backend / filename)
# PGlite has no runtime npm dependencies. Avoid copying pnpm's cyclic symlink graph.
pg_source = (ROOT / 'vision/node_modules/@electric-sql/pglite').resolve()
shutil.copytree(pg_source, backend / 'node_modules/@electric-sql/pglite', ignore=shutil.ignore_patterns('node_modules'))

apk_source = OUT / 'android/app/build/outputs/apk/debug/app-debug.apk'
apk_name = NAME + '.apk'
(PACKAGE / 'android').mkdir()
shutil.copy2(apk_source, PACKAGE / 'android' / apk_name)
shutil.copy2(apk_source, DELIVERABLES / apk_name)
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
node_version = subprocess.check_output(['node', '--version'], text=True).strip()
checks = json.loads((OUT / 'evidence/portable-tests.json').read_text())
if checks.get('status') != 'passed':
    raise RuntimeError('Portable verification did not pass')
build_info = {
    'name': NAME, 'version': '0.2.0-dev', 'sourceCommit': commit,
    'sourceRepository': 'masurovadasha-cmyk/vertex-app', 'sourceBranch': 'vision-foundation-0.1',
    'workflowRunId': os.environ.get('GITHUB_RUN_ID'), 'nodeVersion': node_version,
    'applicationId': 'com.vertex.vision.dev', 'androidVersionCode': 1,
    'androidSignature': 'debug; certificate fingerprint in evidence/apk-signature.txt',
    'androidNativeRuntimeTested': False, 'productionDeployment': False,
    'cloudAuthConnected': False, 'browserAssertionsPassed': len(checks['checks']),
    'excludedSourceFiles': excluded,
    'limitations': ['Synthetic local identities only', 'Only Views/Cleaning Golden Flow implemented', 'No shared cloud database, real authentication, payment or external notifications', 'Desktop browser and Android data are independent', 'No physical Android-device test in this build job']
}
(PACKAGE / 'BUILD-INFO.json').write_text(json.dumps(build_info, ensure_ascii=False, indent=2), encoding='utf-8')
(PACKAGE / 'START-BACKEND.cmd').write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0server-runtime\\vision\\backend\\dev.mjs"\r\nif errorlevel 1 pause\r\n')
readme = '''VERTEX VISION 0.2.0-dev — ПОЛНАЯ ТЕСТОВАЯ СБОРКА

Это сборка текущего кода VISION, а не готовая облачная production-система.
Отдельный пакет Android: com.vertex.vision.dev. Рабочий Vertex не заменяется.

WINDOWS x64
1. Полностью распакуйте ZIP в отдельную папку, не запускайте из окна архива.
2. Откройте START-VISION.cmd. Portable Node.js уже включён, npm не нужен.
3. Откроется http://127.0.0.1:8790. При необходимости откройте адрес вручную.
4. Используйте одну вкладку; для остановки закройте консоль или нажмите Ctrl+C.
   При занятом порте 8790 сначала закройте предыдущий экземпляр VISION.

ANDROID
Установите android/Vertex-Vision-0.2.0-dev.apk. Android 8+ и современный
Android System WebView обязательны. Это debug APK, не выпуск Google Play.
Приложение не запрашивает доступ к Интернету. База и интерфейс находятся внутри.
Сборка APK и подпись проверены; запуск на физическом телефоне здесь не проверялся.

macOS / LINUX
При установленном Node.js 22 выполните: sh start-vision.sh.
Windows node.exe не используется на этих платформах.

ЧТО ПРОВЕРИТЬ
Guest: создать запрос уборки. Views: увидеть запрос.
Vertex Cleaning: назначить сотрудника. Cleaning Staff: начать и отправить на проверку.
Quality: принять или вернуть на доработку. Audit: посмотреть события.
Работают SQL-миграции, команды, транзакции, роли, повторные запросы и журнал.
Другие подразделения представлены в структуре, но их рабочие процессы ещё не реализованы.

ДАННЫЕ И ГРАНИЦЫ
Все профили искусственные. Переключатель ролей не является авторизацией.
Не вводите реальные данные гостей. Данные браузера сохраняются в IndexedDB,
данные Android — в хранилище WebView этого приложения; между устройствами
синхронизации нет. Очистка данных браузера/приложения удаляет тестовые записи.
Оператор устройства контролирует всю локальную базу; это не граница безопасности
для настоящих пользователей. Не публикуйте локальную сборку на публичном сервере.
Нет реальных платежей, облачной авторизации, push/email и интеграции JARVIS.

СОСТАВ
web/ — собранный автономный интерфейс и PostgreSQL WASM;
android/ — новый отдельный VISION APK;
android-source/ — готовый Android-проект с ресурсами;
source/ — текущие исходники ветки (без истории Git и старых сборочных архивов);
staging-worker/ — собранный сервер Cloudflare, без публикации и без ключей;
server-runtime/ — исходный сервер VISION с PGlite, готовый к локальному запуску;
evidence/ — тесты, скриншоты, проверка APK и подписи;
BUILD-INFO.json и SHA256SUMS.txt — версия, источник и контрольные суммы.

СЕРВЕРНЫЙ РЕЖИМ ДЛЯ РАЗРАБОТКИ
START-BACKEND.cmd запускает исходный Node/PGlite backend на том же порте 8790.
Не запускайте одновременно с START-VISION.cmd. В серверном режиме база лежит
в server-runtime/vision/.data/development; это ДРУГАЯ база, не данные браузера.
Сервер привязан только к 127.0.0.1; запрещены публичные туннели и прокси.
Облачное окружение готовится отдельно по source/vision/STAGING.md.

ПОВТОРНАЯ СБОРКА
Команды, версии зависимостей и проверки зафиксированы в
source/.github/workflows/vision-full-build.yml. Этот workflow не делает deploy.
Android debug-ключ не включён. Последующая сборка может иметь другую подпись.
Лицензии bundled Node.js и PGlite сохранены вместе с runtime/package.
'''
(PACKAGE / 'README-RU.txt').write_text(readme, encoding='utf-8')

# Test the exact packaged Node backend in a temporary directory, without shipping test DBs.
smoke = """import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {startDev} from './server-runtime/vision/backend/dev.mjs';const d=await mkdtemp(path.join(os.tmpdir(),'vision-package-'));const app=await startDev({port:0,dataDir:d});try{const r=await fetch(app.url+'/api/profiles');const c=await r.json();if(r.status!==200||c.profiles.length!==6)throw new Error('packaged backend failed');console.log('Packaged backend: PASS (six synthetic profiles)');}finally{await app.close();await rm(d,{recursive:true,force:true});}"""
result = subprocess.run(['node', '--input-type=module', '-e', smoke], cwd=PACKAGE, text=True, capture_output=True, timeout=90)
(PACKAGE / 'evidence/packaged-backend.txt').write_text(result.stdout + result.stderr)
if result.returncode:
    raise RuntimeError('Packaged backend smoke test failed: ' + result.stderr[-2000:])

# No generated dependencies may introduce excluded font/key files into the deliverable.
for file in PACKAGE.rglob('*'):
    if file.is_file() and file.suffix.lower() in (EXCLUDED_SUFFIXES - {'.apk', '.zip'}):
        file.unlink()

def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

manifest = []
for file in sorted(PACKAGE.rglob('*')):
    if file.is_file():
        manifest.append(digest(file) + '  ' + file.relative_to(PACKAGE).as_posix())
(PACKAGE / 'SHA256SUMS.txt').write_text('\n'.join(manifest) + '\n')
zip_path = DELIVERABLES / (NAME + '-FULL.zip')
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in sorted(PACKAGE.rglob('*')):
        if file.is_file():
            archive.write(file, Path(NAME) / file.relative_to(PACKAGE))
(DELIVERABLES / 'SHA256SUMS.txt').write_text('\n'.join(digest(f)+'  '+f.name for f in [zip_path, DELIVERABLES/apk_name])+'\n')
print(json.dumps({'full':str(zip_path),'apk':str(DELIVERABLES/apk_name),'sourceCommit':commit,'checks':len(checks['checks'])},indent=2))
