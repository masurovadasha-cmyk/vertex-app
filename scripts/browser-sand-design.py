"""Sand Luxury UI verification on synthetic HTTP fixtures, never real guest data."""
from pathlib import Path
import json, mimetypes
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'vertex/dist'
OUT = ROOT / 'artifacts/design'
TENANT = '11111111-1111-4111-8111-111111111111'
ORG = '44444444-4444-4444-8444-444444444444'
UNIT = '22222222-2222-4222-8222-222222222222'


def run():
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'status': 'running', 'checks': [], 'errors': [], 'fixtures': 'synthetic HTTP only', 'cloudAuthTested': False}

    def check(name, value):
        report['checks'].append({'name': name, 'passed': bool(value)})
        if not value:
            raise AssertionError(name)

    def serve(route):
        parsed = urlparse(route.request.url)
        if parsed.hostname != 'vision.test':
            route.abort()
            return
        context = {'actorId': '55555555-5555-4555-8555-555555555555', 'tenantId': TENANT, 'organizationId': ORG, 'module': 'views', 'moduleEnabled': True,
                   'roles': ['views-manager'], 'permissions': ['views.operations.read', 'views.booking.manage'], 'capabilities': {}}
        records = {
            '/api/v1/context': context,
            '/api/v1/views/units': [{'id': UNIT, 'unit_number': 'TEST-235', 'unit_type': 'apartment', 'status': 'READY', 'version': 1}],
            '/api/v1/views/bookings': [{'id': '33333333-3333-4333-8333-333333333333', 'unit_id': UNIT,
                                      'public_no': 'VB-DESIGN-TEST', 'check_in': '2026-10-10', 'check_out': '2026-10-12',
                                      'status': 'CONFIRMED', 'currency': 'USD', 'total': 200, 'version': 2, 'created_at': '2026-09-30T12:00:00Z'}],
            '/api/v1/views/cleaning': []
        }
        if parsed.path in records:
            route.fulfill(status=200, content_type='application/json', body=json.dumps(records[parsed.path]))
            return
        file = (SITE / unquote(parsed.path.lstrip('/') or 'index.html')).resolve()
        if not file.is_relative_to(SITE.resolve()) or not file.is_file():
            route.fulfill(status=404, body='Not found')
            return
        kind = 'application/javascript' if file.suffix == '.js' else mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
        route.fulfill(status=200, content_type=kind, body=file.read_bytes())

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                for width in [320, 390, 768, 1440]:
                    ctx = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce', locale='ru-RU')
                    ctx.route('**/*', serve)
                    page = ctx.new_page()
                    page.on('pageerror', lambda error: report['errors'].append(str(error)))
                    page.goto('https://vision.test/', wait_until='networkidle')
                    page.wait_for_function("document.documentElement.dataset.visionReady==='true'")
                    check(f'{width}: Sand Luxury runtime initialized', page.evaluate("document.documentElement.dataset.visionDesign==='sand-luxury'"))
                    check(f'{width}: 19 tiles and 19 vector icons', page.locator('[data-vv-open]').count() == 19 and page.locator('[data-vv-open] .vs-icon').count() == 19)
                    check(f'{width}: no horizontal document overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    check(f'{width}: readable tile text', page.locator('[data-vv-open="managing"] h3').evaluate("el=>getComputedStyle(el).color==='rgb(245, 241, 232)'"))
                    check(f'{width}: all tile hit areas are at least 44px', page.locator('[data-vv-open]').evaluate_all('els=>els.every(el=>el.getBoundingClientRect().width>=44&&el.getBoundingClientRect().height>=44)'))
                    check(f'{width}: no decorative animation in reduced-motion mode', page.locator('[data-vv-open="views"]').evaluate("el=>getComputedStyle(el).animationName==='none'"))
                    check(f'{width}: Views CTA is gold, not legacy pink', page.locator('[data-vv-shortcut="views"]').evaluate("el=>getComputedStyle(el).backgroundImage.includes('linear-gradient') && getComputedStyle(el).color==='rgb(41, 39, 25)'"))
                    if width < 621:
                        page.wait_for_function("document.documentElement.dataset.visionArea==='hub'")
                        check(f'{width}: one mobile navigation, not two overlays', not page.locator('#mobileNav').is_visible() and page.locator('.vs-dock').is_visible())
                    page.screenshot(path=str(OUT / f'sand-hub-{width}.png'))
                    page.locator('[data-vs-dock="search"]').click()
                    check(f'{width}: dock search focuses real search input', page.locator('#visionSearch').evaluate('el=>el===document.activeElement'))
                    page.locator('#visionSearch').fill('Laundry')
                    check(f'{width}: live module search', page.locator('[data-vv-open]').count() == 1)
                    page.locator('#visionSearch').fill('')
                    for module in ['ditalia', 'engineers', 'travel']:
                        page.locator(f'[data-vv-open="{module}"]').click()
                        check(f'{width}: {module} visual workflow has 3 steps', page.locator('#visionModuleDialog .vs-workflow span').count() == 3)
                        check(f'{width}: {module} remains Coming Soon', page.locator('#visionModuleDialog [data-vv-action]').count() == 0)
                        check(f'{width}: {module} themed detail fits', page.locator('#visionModuleDialog').evaluate('el=>el.scrollWidth<=el.clientWidth'))
                        page.keyboard.press('Escape')
                    page.evaluate('VertexVisionViews.open()')
                    check(f'{width}: disconnected metrics are dashes, not invented numbers', page.locator('.vs-unavailable-kpis b').all_inner_texts() == ['—', '—', '—'])
                    check(f'{width}: Views close control is inside screen', page.locator('[data-vvo-close]').evaluate('el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}'))
                    check(f'{width}: real-data connection warning preserved', page.locator('.vvo-connect').is_visible())
                    page.screenshot(path=str(OUT / f'sand-views-unconfigured-{width}.png'))
                    page.keyboard.press('Escape')
                    page.evaluate("VertexVisionViews.configure({tenantId:'"+TENANT+"',organizationId:'"+ORG+"',token:'test.jwt.token'})")
                    page.evaluate('VertexVisionViews.open()')
                    page.wait_for_selector('.vvo-kpis')
                    check(f'{width}: real API adapter still renders test unit', page.locator('#visionViewsOperations').get_by_text('TEST-235').count() > 0)
                    check(f'{width}: data completeness notice visible', page.locator('.vs-data-note').is_visible())
                    for tab in ['calendar', 'bookings', 'units', 'cleaning', 'dashboard']:
                        page.locator(f'[data-vvo-tab="{tab}"]').click()
                        check(f'{width}: {tab} tab works', page.locator(f'[data-vvo-tab="{tab}"]').get_attribute('aria-current') == 'page')
                        check(f'{width}: {tab} content fits', page.locator('.vvo-main').evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    # Label the screenshot fixture. This banner is not shipped in the application.
                    page.locator('.vvo-head p').evaluate("el=>el.textContent='ТЕСТОВЫЕ ДАННЫЕ ДЛЯ ПРОВЕРКИ ДИЗАЙНА / UI TEST FIXTURE'")
                    page.screenshot(path=str(OUT / f'sand-views-fixture-{width}.png'))
                    page.keyboard.press('Escape')
                    page.evaluate('VertexVisionViews.clearSession()')
                    page.locator('#language').click()
                    check(f'{width}: English language supported', page.locator('#visionHome .vv-title').inner_text().startswith('One platform.'))
                    check(f'{width}: changing language never opens closed dialogs', page.locator('dialog[open]').count() == 0)
                    check(f'{width}: no page JavaScript errors', not report['errors'])
                    ctx.close()
                ctx = browser.new_context(viewport={'width': 390, 'height': 900}, reduced_motion='no-preference')
                ctx.route('**/*', serve)
                page = ctx.new_page()
                page.goto('https://vision.test/', wait_until='networkidle')
                check('motion: entrance enabled when allowed', page.locator('#visionHome').evaluate("el=>getComputedStyle(el).animationName==='vs-enter'"))
                page.wait_for_timeout(400)  # Wait beyond the finite 320 ms entrance.
                check('motion: fixed dock stays inside the viewport', page.locator('.vs-dock').evaluate('el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}'))
                check('motion: hub does not retain a transformed containing block', page.locator('#visionHome').evaluate("el=>getComputedStyle(el).transform==='none'"))
                page.locator('[data-vv-open="views"]').hover()
                check('motion: hover has short transition, no infinite loop', page.locator('[data-vv-open="views"]').evaluate("el=>getComputedStyle(el).transitionDuration.includes('0.16s') && getComputedStyle(el).animationIterationCount==='1'"))
                ctx.close()
            finally:
                browser.close()
        report['status'] = 'passed'
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = str(error)
        raise
    finally:
        (OUT / 'sand-design-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': report['status'], 'checks': len(report['checks']), 'errors': report['errors']}))


if __name__ == '__main__':
    run()
