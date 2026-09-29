"""Taxi DOM tests on synthetic local data; never send a request or contact a driver.
The default routed HTTPS test origin uses real browser storage. --memory substitutes
an explicit in-memory fixture when the local sandbox disallows browser networking.
"""
from pathlib import Path
import argparse, importlib.util, json, mimetypes, os
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];SITE=ROOT/'vertex/dist';OUT=ROOT/'artifacts/quality'

def run(memory=False):
    OUT.mkdir(parents=True,exist_ok=True)
    checks=[];errors=[]
    def check(name,value):
        checks.append({'name':name,'pass':bool(value)})
        if not value: raise AssertionError(name)
    spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/browser-quality.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
    with sync_playwright() as p:
        cfg={'headless':True,'args':['--no-sandbox']}
        exe=os.environ.get('CHROMIUM_PATH')
        if exe:cfg['executable_path']=exe
        browser=p.chromium.launch(**cfg)
        try:
            for width in [320,390,768,1440]:
                ctx=browser.new_context(viewport={'width':width,'height':844},locale='ru-RU',timezone_id='Asia/Tashkent',service_workers='block',reduced_motion='reduce')
                def serve(route):
                    url=urlparse(route.request.url)
                    if url.hostname!='vertex.test':route.abort();return
                    f=(SITE/unquote(url.path.lstrip('/') or 'index.html')).resolve()
                    if not f.is_relative_to(SITE) or not f.is_file():route.fulfill(status=404,body='Not found');return
                    mime='application/javascript' if f.suffix=='.js' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
                    route.fulfill(status=200,body=f.read_bytes(),content_type=mime)
                ctx.route('**/*',serve)
                page=ctx.new_page();page.set_default_timeout(8000);page.on('pageerror',lambda e:errors.append(str(e)))
                if memory:page.set_content(base.bundle(SITE),wait_until='load')
                else:page.goto('https://vertex.test/',wait_until='load')
                check(f'{width}: red taxi entry visible',page.locator('#openTaxi').is_visible())
                check(f'{width}: no home overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                page.locator('#openTaxi').click()
                check(f'{width}: opens inside app',page.locator('#taxiForm').is_visible())
                check(f'{width}: demo notice before input','водитель их не получают' in page.locator('.taxi-notice').inner_text())
                page.locator('#taxiFrom').fill('QA Airport');page.locator('#taxiTo').fill('QA NRG U-Tower')
                for km,price in [('5',5),('10',10),('15',17.5)]:
                    page.locator('#taxiKm').fill(km)
                    actual=page.locator('#taxiPrice').inner_text().replace('\xa0','').replace(',','.')
                    check(f'{width}: estimate {km}km',f'{price:.2f}' in actual)
                page.locator('[data-taxi-model=C16]').click()
                check(f'{width}: fleet selection changes model',page.locator('#taxiForm [name=model]').input_value()=='C16')
                check(f'{width}: taxi form fits screen',page.locator('#modal').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
                if width==390:
                    page.locator('#modal').evaluate('el=>el.scrollTo(0,0)');page.screenshot(path=str(OUT/'taxi-route.png'))
                page.locator('#taxiForm [name=note]').fill('<img src=x onerror=alert(1)>')
                page.locator('#taxiForm [name=consent]').check();page.locator('#taxiForm [type=submit]').click()
                check(f'{width}: request is saved locally',page.locator('.taxi-order').count()==1)
                check(f'{width}: request is explicitly not sent','Водителю не отправлена' in page.locator('[role=status]').filter(has_text='Водителю').inner_text())
                check(f'{width}: note is escaped',page.locator('.taxi-order img').count()==0 and '<img' in page.locator('.taxi-order').inner_text())
                if width==390:page.screenshot(path=str(OUT/'taxi-saved.png'))
                page.locator('[data-taxi-view=dispatch]').click();page.locator('[data-taxi-vehicle]').select_option('C16-01');page.locator('[data-taxi-next=assigned]').click()
                check(f'{width}: dispatcher assigns selected model','C16-01' in page.locator('.taxi-order').inner_text())
                page.locator('[data-taxi-next=arriving]').click();page.locator('[data-taxi-next=on_trip]').click();page.locator('[data-taxi-next=completed]').click()
                check(f'{width}: ride state reaches demo completion','Завершено · демо' in page.locator('.taxi-status').inner_text())
                if not memory:
                    page.reload();page.evaluate("VertexTaxi.open('history')")
                    check(f'{width}: real storage survives reload',page.locator('.taxi-order').count()==1)
                page.evaluate("VertexGroup.request('taxi')")
                check(f'{width}: service shortcut opens internal taxi',page.locator('#taxiForm').is_visible())
                page.evaluate('VertexMobility.openQuote()');check(f'{width}: old transfer entry uses new taxi',page.locator('#taxiForm').is_visible())
                check(f'{width}: no JavaScript errors',not errors)
                ctx.close()
            if memory:
                for raw in ['null','{"orders":[null]}','not JSON']:
                    page=browser.new_page();page.set_content(base.bundle(SITE,{'vertex-taxi-v1':raw}),wait_until='load');page.evaluate('VertexTaxi.open()')
                    check('corrupt taxi storage is reported: '+raw,'повреждены' in page.locator('#taxiError').inner_text())
                    check('corrupt bytes preserved: '+raw,page.evaluate("__testStore.getItem('vertex-taxi-v1')")==raw)
                    page.close()
                page=browser.new_page();page.set_content(base.bundle(SITE,fail_write=True),wait_until='load');page.evaluate('VertexTaxi.open()')
                page.locator('#taxiFrom').fill('QA Airport');page.locator('#taxiTo').fill('QA Destination');page.locator('#taxiKm').fill('15');page.locator('[name=consent]').check();page.locator('#taxiForm [type=submit]').click()
                check('failed save does not claim success','Не удалось сохранить' in page.locator('#taxiError').inner_text());check('failed save creates no order',page.evaluate('VertexTaxi.getSnapshot().orders.length')==0);page.close()
        finally:
            browser.close()
            (OUT/'taxi-browser.json').write_text(json.dumps({'mode':'in-memory fixture' if memory else 'routed test origin with real localStorage','checks':checks,'errors':errors},ensure_ascii=False,indent=2))
    print(f'PASS {len(checks)} taxi DOM assertions')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--memory',action='store_true');run(parser.parse_args().memory)
