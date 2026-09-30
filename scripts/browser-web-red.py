"""Red palette regression and optional read-only verification of the deployed site.
Offline tests use a routed HTTPS origin. --live never writes production data.
"""
from pathlib import Path
import argparse, json, mimetypes, os, time, urllib.request
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'vertex/dist'
OUT = ROOT / 'artifacts/quality'
URL = 'https://vertex-app.masurovadasha.workers.dev/'
REVISION = 'unified-journey1'


def run(live=False):
    OUT.mkdir(parents=True, exist_ok=True)
    memory = not live and os.environ.get('VERTEX_MEMORY_TEST') == '1'
    checks = []
    errors = []
    report = {'mode': 'live-read-only' if live else 'explicit in-memory DOM fixture' if memory else 'routed HTTPS test origin', 'checks': checks, 'errors': errors}
    def check(name, value):
        checks.append({'name': name, 'pass': bool(value)})
        if not value:
            raise AssertionError(name)
    def color(page, selector, prop):
        return page.locator(selector).first.evaluate('(el,p)=>getComputedStyle(el)[p]', prop)
    try:
        if live:
            # Workers Builds runs independently of GitHub CI. Observe; never deploy here.
            for attempt in range(18):
                try:
                    # Identify this release monitor. The generic Python-urllib
                    # agent is rejected by the public edge with HTTP 403.
                    req = urllib.request.Request(URL + 'release.json?check=' + str(time.time_ns()), headers={'Cache-Control': 'no-cache', 'User-Agent': 'VertexReleaseVerifier/1.0'})
                    with urllib.request.urlopen(req, timeout=15) as r:
                        release = json.load(r)
                    if release.get('revision') == REVISION:
                        report['release'] = release
                        break
                except (OSError, ValueError) as exc:
                    if attempt in (0, 17):
                        print(f'Live release probe {attempt + 1}: {type(exc).__name__}: {exc}')
                if attempt < 17:
                    time.sleep(10)
            check('live release revision matches the requested red update', report.get('release', {}).get('revision') == REVISION)
        with sync_playwright() as p:
            args = {'headless': True, 'args': ['--no-sandbox']}
            exe = os.environ.get('CHROMIUM_PATH')
            if exe:
                args['executable_path'] = exe
            browser = p.chromium.launch(**args)
            try:
                for width in [320, 390, 768, 1440]:
                    context = browser.new_context(viewport={'width': width, 'height': 844}, locale='ru-RU', timezone_id='Asia/Tashkent', service_workers='allow' if live else 'block', reduced_motion='reduce')
                    if not live:
                        def serve(route):
                            u = urlparse(route.request.url)
                            if u.hostname != 'vertex.test':
                                route.abort(); return
                            f = (SITE / unquote(u.path.lstrip('/') or 'index.html')).resolve()
                            if not f.is_relative_to(SITE.resolve()) or not f.is_file():
                                route.fulfill(status=404, body='Not found'); return
                            mime = 'application/javascript' if f.suffix == '.js' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
                            route.fulfill(status=200, body=f.read_bytes(), content_type=mime)
                        context.route('**/*', serve)
                    page = context.new_page()
                    page.set_default_timeout(12000)
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    if memory:
                        import importlib.util
                        spec = importlib.util.spec_from_file_location('quality', ROOT/'scripts/browser-quality.py')
                        quality = importlib.util.module_from_spec(spec); spec.loader.exec_module(quality)
                        page.set_content(quality.bundle(SITE), wait_until='load')
                    else:
                        response = page.goto(URL if live else 'https://vertex.test/', wait_until='networkidle', timeout=45000)
                        check(f'{width}: root responds with HTTP 200', response.status == 200)
                    page.wait_for_timeout(120)
                    check(f'{width}: guest action is approved red', color(page, '#searchButton', 'backgroundColor') == 'rgb(229, 29, 87)')
                    check(f'{width}: hero is white, not sand', color(page, '.hero-copy', 'backgroundColor') == 'rgb(255, 255, 255)')
                    check(f'{width}: dark heading remains readable', color(page, '#headline', 'color') == 'rgb(34, 34, 34)')
                    check(f'{width}: body does not overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
                    if width == 390:
                        page.screenshot(path=str(OUT / ('web-red-live-home.png' if live else 'web-red-home.png')))
                    page.locator('#hostPanel').click()
                    check(f'{width}: current Host Studio preserved', page.locator('.vh-shell').count() == 1)
                    check(f'{width}: host welcome is red', color(page, '.vh-welcome', 'backgroundColor') == 'rgb(229, 29, 87)')
                    check(f'{width}: host avatar is red on pale red', color(page, '.vh-avatar', 'color') == 'rgb(206, 23, 75)')
                    if width == 390:
                        page.screenshot(path=str(OUT / ('web-red-live-host.png' if live else 'web-red-host.png')))
                    for route_name in ['menu', 'calendar', 'listings', 'messages', 'earnings', 'account']:
                        page.evaluate('(r)=>VertexHostConsole.open(r)', route_name)
                        check(f'{width}: {route_name} renders without overflow', page.locator('#modal').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                    page.evaluate("VertexHostConsole.open('calendar')")
                    check(f'{width}: full calendar preserved', page.locator('.cal-day').count() >= 28)
                    page.evaluate("VertexHostConsole.open('menu')")
                    check(f'{width}: selected host tab is red', color(page, '.vh-nav [aria-current=page]', 'color') == 'rgb(206, 23, 75)')
                    page.evaluate('VertexTaxi.open()')
                    check(f'{width}: taxi opens inside the published app', page.locator('#taxiForm').is_visible())
                    check(f'{width}: no live driver dispatch is claimed', page.evaluate('VertexTaxi.liveDispatch') is False)
                    if width == 390:
                        page.screenshot(path=str(OUT / ('web-red-live-taxi.png' if live else 'web-red-taxi.png')))
                    check(f'{width}: no JavaScript errors', not errors)
                    context.close()
            finally:
                browser.close()
    finally:
        report['checked_at_utc'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
        (OUT / ('web-red-live.json' if live else 'web-red-tests.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f'PASS {len(checks)} red web assertions ({report["mode"]})')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    run(parser.parse_args().live)
