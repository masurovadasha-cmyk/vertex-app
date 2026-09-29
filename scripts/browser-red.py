"""Regression checks for the approved red theme and real host navigation.
Runs against synthetic in-memory data only; never calls an external service.
"""
from pathlib import Path
import importlib.util, json, os, re
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location('quality', Path(__file__).with_name('browser-quality.py'))
quality = importlib.util.module_from_spec(spec); spec.loader.exec_module(quality)
OUT = quality.OUT; checks=[]
def check(name, condition):
    checks.append({'name':name,'pass':bool(condition)})
    if not condition: raise AssertionError(name)
def rgb(page, selector, prop='color'):
    return page.locator(selector).first.evaluate('(el,p)=>getComputedStyle(el)[p]',prop)
def run():
    with sync_playwright() as p:
        config={'headless':True,'args':['--no-sandbox']}
        exe=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
        if Path(exe).exists(): config['executable_path']=exe
        browser=p.chromium.launch(**config)
        try:
            for width in [320,390,768,1440]:
                page=browser.new_page(viewport={'width':width,'height':844},locale='ru-RU',timezone_id='Asia/Tashkent',reduced_motion='reduce')
                errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
                page.set_content(quality.bundle(quality.ROOT),wait_until='load');page.wait_for_timeout(80)
                check(f'{width}: primary button is approved red',rgb(page,'#searchButton','backgroundColor')=='rgb(229, 29, 87)')
                check(f'{width}: heading remains readable dark',rgb(page,'#headline')=='rgb(34, 34, 34)')
                check(f'{width}: no horizontal home overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                if width==390: page.screenshot(path=str(OUT/'red-01-home.png'))
                page.evaluate("VertexHostConsole.open('today')");page.wait_for_timeout(80)
                check(f'{width}: host navigation has five SVG icons',page.locator('.vhv-nav .vh-icon-svg').count()==5)
                check(f'{width}: host icons are not decorated twice',page.locator('.vhv-shell .vx-icon').count()==0)
                check(f'{width}: avatar uses red theme',rgb(page,'.vhv-avatar','color')=='rgb(206, 23, 75)')
                if width==390: page.screenshot(path=str(OUT/'red-02-host.png'))
                page.locator('[data-vh-tab=listings]').click();page.locator('[data-ht=menu]').click()
                check(f'{width}: listings returns to current menu, not old menu',page.locator('[data-vh-action=earnings]').count()==1)
                if width==390: page.screenshot(path=str(OUT/'red-03-menu.png'))
                page.locator('[data-vh-action=earnings]').click()
                check(f'{width}: earnings retains ALL properties',page.locator('.vhv-property-money').count()==page.evaluate('VertexRentals.getSnapshot().properties.length'))
                page.locator('[data-vh-tab=menu]').click();page.locator('[data-vh-action=performance]').click()
                check(f'{width}: analytics opens from menu',page.locator('.vhv-metric-grid').count()==1)
                page.locator('[data-vh-tab=calendar]').click()
                check(f'{width}: full calendar preserved',page.locator('.cal-day').count()==page.evaluate('new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()'))
                if width==390: page.screenshot(path=str(OUT/'red-04-calendar.png'))
                page.evaluate("VertexHostConsole.open('listings')")
                page.locator('#hostListingSearch').fill('___no_match___')
                check(f'{width}: search empty state preserved',page.locator('#hostSearchEmpty').is_visible())
                page.locator('#hostListingSearch').fill('')
                if width==390: page.screenshot(path=str(OUT/'red-05-listings.png'))
                page.evaluate("VertexHostConsole.open('messages')")
                check(f'{width}: local messages screen preserved','локальные обсуждения' in page.locator('#modalBody').inner_text())
                check(f'{width}: no JS errors',not errors)
                page.close()
            # Use a routed secure origin and the browser's REAL localStorage, not a storage mock.
            from urllib.parse import urlparse, unquote
            import mimetypes
            context=browser.new_context(service_workers='block',locale='ru-RU',timezone_id='Asia/Tashkent')
            def serve(route):
                url=urlparse(route.request.url)
                if url.hostname!='vertex.test':
                    route.abort();return
                path=(quality.ROOT/unquote(url.path.lstrip('/') or 'index.html')).resolve()
                if not path.is_relative_to(quality.ROOT.resolve()) or not path.is_file():
                    route.fulfill(status=404,body='Not found');return
                route.fulfill(status=200,body=path.read_bytes(),content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
            context.route('**/*',serve)
            page=context.new_page();page.goto('https://vertex.test/')
            page.evaluate('VertexRentals.createListing()')
            page.locator('#listingForm [name=name]').fill('QA storage only')
            page.locator('#listingForm [name=price]').fill('500000')
            page.locator('#listingForm [name=host]').fill('QA test')
            page.locator('#listingForm [name=description]').fill('Synthetic fixture, not a real apartment')
            page.locator('#listingForm button[type=submit]').click()
            check('real browser storage receives local listing',page.evaluate('JSON.parse(localStorage.getItem("vertex-rentals-v1")).listings.length')==1)
            page.reload()
            check('listing survives real browser reload',page.evaluate('VertexRentals.getSnapshot().listings[0].ru')=='QA storage only')
            second=context.new_page();second.goto('https://vertex.test/')
            check('new same-origin page reads saved listing',second.evaluate('VertexRentals.getSnapshot().listings[0].ru')=='QA storage only')
            context.close()
            # Frozen clock: Tashkent already crossed midnight while UTC has not.
            page=browser.new_page(locale='ru-RU',timezone_id='Asia/Tashkent')
            page.clock.install(time=__import__('datetime').datetime(2026,10,15,1,0,tzinfo=__import__('datetime').timezone(__import__('datetime').timedelta(hours=5))))
            from datetime import datetime
            booking={'id':'qa-finished','listingId':'utower','guest':'QA finished stay','title':'QA','arrival':'2026-10-12','departure':'2026-10-15','guests':1,'status':'Подтверждено','createdAt':'2026-10-01T00:00:00Z','currency':'UZS','total':100000}
            # Inject only the snapshot boundary, leaving real DOM and host code intact.
            page.set_content(quality.bundle(quality.ROOT),wait_until='load')
            page.evaluate('b=>{const api=VertexRentals;const s=api.getSnapshot();window.VertexRentals={...api,getSnapshot:()=>({...s,bookings:[b]})}}',booking)
            page.evaluate("VertexHostConsole.open('today')")
            check('Tashkent checkout day is not an upcoming stay',page.locator('.vhv-booking').count()==0)
            page.close()
        finally:
            browser.close()
            (OUT/'red-tests.json').write_text(json.dumps({'mode':'isolated browser fixtures plus real browser localStorage on routed test origin; not production verification','checks':checks},ensure_ascii=False,indent=2))
    print(f'PASS {len(checks)} red theme and host navigation assertions')
if __name__=='__main__': run()
