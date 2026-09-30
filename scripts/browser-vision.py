"""Verify the unified public demo without creating real orders or changing cloud data."""
from pathlib import Path
import argparse, hashlib, json, mimetypes, time, urllib.request
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'vertex/dist'
OUT=ROOT/'artifacts/vision'
URL='https://vertex-app.masurovadasha.workers.dev/'

def download(url):
    request=urllib.request.Request(url,headers={'User-Agent':'VertexReleaseVerifier/1.0','Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=30) as response:
        return response.read()

def run(live=False):
    OUT.mkdir(parents=True,exist_ok=True)
    checks=[];errors=[];report={'mode':'live-read-only' if live else 'routed-HTTPS','checks':checks,'errors':errors}
    def check(name,value):
        checks.append({'name':name,'passed':bool(value)})
        if not value:raise AssertionError(name)
    try:
        if live:
            for attempt in range(20):
                try:
                    data=json.loads(download(URL+'api/vision/v1/health?check='+str(time.time_ns())))
                    release=json.loads(download(URL+'release.json?check='+str(time.time_ns())))
                    if data.get('revision')=='vision-unified1' and release.get('revision')=='vision-unified1':break
                except (OSError,ValueError):pass
                if attempt==19:raise RuntimeError('Unified Cloudflare deployment was not observed')
                time.sleep(8)
            check('live core explicitly reports no cloud authentication',data.get('authenticated') is False and data.get('productionReady') is False)
            hashes={}
            for file in sorted(SITE.iterdir()):
                if not file.is_file() or file.name.startswith('_') or file.name.startswith('.'):continue
                expected=hashlib.sha256(file.read_bytes()).hexdigest()
                actual=hashlib.sha256(download(URL+file.name+'?verify='+expected)).hexdigest()
                check('live SHA256 '+file.name,actual==expected);hashes[file.name]=actual
            report['live_hashes']=hashes
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            try:
                for width in [390,1440]:
                    context=browser.new_context(viewport={'width':width,'height':960},locale='ru-RU',reduced_motion='reduce')
                    if not live:
                        def serve(route):
                            parsed=urlparse(route.request.url)
                            if parsed.hostname!='vision.test':route.abort();return
                            file=(SITE/unquote(parsed.path.lstrip('/') or 'index.html')).resolve()
                            if not file.is_relative_to(SITE.resolve()) or not file.is_file():route.fulfill(status=404,body='Not found');return
                            kind='application/javascript' if file.suffix=='.js' else mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
                            route.fulfill(status=200,body=file.read_bytes(),content_type=kind)
                        context.route('**/*',serve)
                    page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda error:errors.append(str(error)))
                    response=page.goto(URL if live else 'https://vision.test/',wait_until='networkidle',timeout=60000)
                    check(str(width)+': root HTTP 200',response.status==200)
                    page.wait_for_function("document.documentElement.dataset.visionReady==='true'")
                    check(str(width)+': VISION is the first section',page.locator('main > section').first.get_attribute('id')=='visionHome')
                    check(str(width)+': 19 visible child module cards',page.locator('[data-vv-open]').count()==19)
                    check(str(width)+': all modules depend on the core, not on Views',page.evaluate("VertexVision.core.modules.every(m=>m.parent==='vertex-vision' && m.dependencies.join()==='vision-core')"))
                    check(str(width)+': explicit disconnected-cloud disclosure','не подключены' in page.locator('#visionHome .vv-disclosure').inner_text())
                    check(str(width)+': no horizontal document overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.screenshot(path=str(OUT/f'vision-home-{width}.png'))
                    page.locator('#visionSearch').fill('laundry');check(str(width)+': module search',page.locator('[data-vv-open]').count()==1)
                    page.locator('#visionSearch').fill('');page.locator('#visionDomain').select_option('services');check(str(width)+': service filter',page.locator('[data-vv-open]').count()==3)
                    page.locator('#visionDomain').select_option('')
                    for module in page.evaluate('VertexVision.core.modules.map(m=>m.id)'):
                        page.locator('[data-vv-open="'+module+'"]').click()
                        check(str(width)+': '+module+' detail opens',page.locator('#visionModuleDialog').is_visible())
                        check(str(width)+': '+module+' dialog fits',page.locator('#visionModuleDialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                        page.keyboard.press('Escape')
                    for module,action,selector in [('views','host','.vh-shell'),('taxi','taxi','#taxiForm'),('travel','packages','#groupPackageForm'),('cleaning','cleaning-request','#groupRequestForm'),('concierge','guest-guide','#modal[open]')]:
                        page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
                        check(str(width)+': adapter '+module,page.evaluate('([m,a])=>VertexVision.navigate(m,a)',[module,action]))
                        check(str(width)+': existing UI '+module,page.locator(selector).first.is_visible())
                    page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
                    check(str(width)+': unknown action rejected',page.evaluate("VertexVision.navigate('views','invalid')===false"))
                    page.locator('#language').click()
                    check(str(width)+': English platform copy',page.locator('#visionHome .vv-title').inner_text().startswith('One platform.'))
                    page.locator('#language').click()
                    page.locator('[data-vv-open="views"]').click();page.screenshot(path=str(OUT/f'vision-views-{width}.png'))
                    page.keyboard.press('Escape');page.evaluate('VertexVision.home()')
                    check(str(width)+': no JavaScript errors',not errors)
                    context.close()
            finally:browser.close()
        report['status']='passed'
    except Exception as error:
        report['status']='failed';report['error']=str(error);raise
    finally:
        (OUT/('live-report.json' if live else 'browser-report.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'status':report.get('status'),'checks':len(checks),'errors':errors},ensure_ascii=False))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true');run(parser.parse_args().live)
