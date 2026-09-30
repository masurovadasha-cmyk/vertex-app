"""Real UI -> real Worker handler -> SQL/RLS; Auth and PostgREST transport are local test adapters."""
from pathlib import Path
import json, os, subprocess, urllib.request, urllib.error
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/fullstack-browser'
OUT.mkdir(parents=True,exist_ok=True)
report={'status':'running','checks':[],'errors':[],'auth':'synthetic-local-only','database':'PGlite real SQL migrations/RLS','cloudVerified':False}
def check(label,value):
    report['checks'].append({'name':label,'passed':bool(value)})
    assert value,label
def get(url):
    with urllib.request.urlopen(url,timeout=15) as r:return json.load(r)
def post(url):
    with urllib.request.urlopen(urllib.request.Request(url,method='POST'),timeout=15) as r:return json.load(r)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('VISION_BROWSER_EXECUTABLE') or None)
        try:
            for width in [390,1440]:
                log=(OUT/f'server-{width}.log').open('w')
                server=subprocess.Popen(['node','vision/tests/fixtures/fullstack-server.mjs'],cwd=ROOT,env={**os.environ,'VISION_LOCAL_E2E':'synthetic-only'},stdout=subprocess.PIPE,stderr=log,text=True)
                try:
                    connection=json.loads(server.stdout.readline());base=connection['url']
                    config=get(base+'/__test__/configuration');demo=config['demo']
                    context=browser.new_context(viewport={'width':width,'height':920},reduced_motion='reduce',service_workers='block')
                    def bridge(route):
                        parsed=urlsplit(route.request.url)
                        if parsed.hostname!='vision.test':route.abort();return
                        headers={k:v for k,v in route.request.headers.items() if k not in {'host','content-length','origin'}}
                        if 'origin' in route.request.headers:headers['origin']=base
                        body=route.request.post_data
                        req=urllib.request.Request(base+parsed.path+('?' + parsed.query if parsed.query else ''),
                            data=body.encode() if body else None,headers=headers,method=route.request.method)
                        try:response=urllib.request.urlopen(req,timeout=20)
                        except urllib.error.HTTPError as e:response=e
                        with response:
                            route.fulfill(status=response.status,headers={k:v for k,v in response.headers.items() if k.lower() not in {'transfer-encoding','content-length','connection'}},body=response.read())
                    context.route('**/*',bridge)
                    page=context.new_page();page.set_default_timeout(15000)
                    page.on('pageerror',lambda e:report['errors'].append(str(e)))
                    page.goto('https://vision.test/',wait_until='networkidle')
                    page.wait_for_function("document.documentElement.dataset.visionDesign==='sand-luxury'")
                    check(f'{width}: 19 design tiles',page.locator('[data-vv-open]').count()==19)
                    check(f'{width}: no horizontal Hub overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.screenshot(path=str(OUT/f'hub-{width}.png'))
                    page.locator('[data-vv-shortcut="views"]').click()
                    check(f'{width}: disconnected state does not invent metrics',page.locator('.vs-unavailable-kpis b').all_inner_texts()==['—','—','—'])
                    def connect(role,tab='dashboard'):
                        page.evaluate('(s)=>VertexVisionViews.configure(s)',config['profiles'][role])
                        page.evaluate('(tab)=>VertexVisionViews.open(tab)',tab)
                        page.wait_for_selector('.vvo-loading',state='hidden')
                    connect('views')
                    def create_booking(start,end):
                        page.locator('.vvo-new-booking').click()
                        form=page.locator('[data-vvo-create-form]')
                        form.locator('[name="unit_id"]').select_option(demo['unit_id'])
                        form.locator('[name="customer_id"]').fill(demo['customer_id'])
                        form.locator('[name="check_in"]').fill(start);form.locator('[name="check_out"]').fill(end)
                        form.locator('[name="total"]').fill('0.29')
                        form.locator('[type="submit"]').click()
                        page.wait_for_selector('.vvo-loading',state='hidden')
                        page.wait_for_selector('[data-vvo-command="confirm_booking"]')
                    create_booking('2026-10-10','2026-10-12')
                    check(f'{width}: form creates actual pending SQL booking',get(base+'/__test__/state')['bookings'][0]['status']=='PENDING')
                    page.locator('[data-vvo-command="confirm_booking"]').click();page.wait_for_selector('[data-vvo-command="check_in"]')
                    page.locator('[data-vvo-command="check_in"]').click();page.wait_for_selector('[data-vvo-command="check_out"]')
                    check(f'{width}: SQL stay checked in',get(base+'/__test__/state')['unit']['status']=='OCCUPIED')
                    post(base+'/__test__/lose-next-ack')
                    page.locator('[data-vvo-command="check_out"]').click();page.wait_for_selector('[data-vvo-retry]:not([disabled])')
                    before=get(base+'/__test__/state')
                    check(f'{width}: lost acknowledgement occurs after real atomic checkout',len(before['cleaning'])==1 and before['bookings'][0]['status']=='CHECKED_OUT')
                    page.reload(wait_until='networkidle');connect('views','bookings')
                    check(f'{width}: pending operation resumes only after reauthentication',page.locator('[data-vvo-retry]').is_visible())
                    page.locator('[data-vvo-retry]').click();page.wait_for_selector('.vvo-loading',state='hidden');page.wait_for_selector('[data-vvo-retry]',state='hidden')
                    after=get(base+'/__test__/state')
                    check(f'{width}: replay creates no additional SQL task or receipt',len(after['cleaning'])==1 and after['receipts']==before['receipts'])
                    connect('staff','cleaning')
                    page.locator('[data-vvo-command="cleaning_start"]').click();page.wait_for_selector('[data-vvo-command="cleaning_submit"]')
                    page.locator('[data-vvo-command="cleaning_submit"]').click();page.wait_for_selector('.vvo-status-inspection')
                    check(f'{width}: executor cannot approve own work from UI',page.locator('[data-vvo-command="cleaning_verify"]').count()==0)
                    connect('quality','cleaning');page.locator('[data-vvo-command="cleaning_verify"]').click();page.wait_for_selector('.vvo-status-verified')
                    check(f'{width}: independent quality returns actual SQL unit to READY',get(base+'/__test__/state')['unit']['status']=='READY')
                    connect('views')
                    create_booking('2026-11-10','2026-11-12')
                    page.locator('[data-vvo-command="cancel_booking"]').click();page.wait_for_selector('.vvo-status-cancelled')
                    check(f'{width}: cancellation persisted',any(b['status']=='CANCELLED' for b in get(base+'/__test__/state')['bookings']))
                    for tab in ['dashboard','calendar','bookings','units','cleaning']:
                        page.locator(f'[data-vvo-tab="{tab}"]').click()
                        check(f'{width}: {tab} fits new design',page.locator('.vvo-main').evaluate('el=>el.scrollWidth<=el.clientWidth'))
                    post(base+'/__test__/seed-units');page.locator('[data-vvo-refresh]').click();page.wait_for_selector('.vvo-loading',state='hidden')
                    page.locator('[data-vvo-tab="units"]').click()
                    check(f'{width}: initial page is bounded',page.locator('.vvo-unit-grid article').count()==50)
                    page.locator('[data-vvo-more="units"]').click();page.wait_for_selector('[data-vvo-more="units"]',state='hidden')
                    check(f'{width}: second cursor page loads remaining units',page.locator('.vvo-unit-grid article').count()==53)
                    page.locator('[data-vvo-tab="dashboard"]').click()
                    page.locator('.vvo-head p').evaluate("el=>el.textContent='ТЕСТОВЫЙ SQL-КОНТУР / SYNTHETIC AUTH — НЕ ОБЛАЧНЫЕ ДАННЫЕ'")
                    page.screenshot(path=str(OUT/f'views-sql-{width}.png'))
                    check(f'{width}: no token written to tab storage',page.evaluate("!JSON.stringify(sessionStorage).includes('synthetic.views.jwt')"))
                    check(f'{width}: no page errors',not report['errors'])
                    context.close()
                finally:
                    server.terminate()
                    try:server.wait(timeout=8)
                    except subprocess.TimeoutExpired:server.kill();server.wait()
                    log.close()
        finally:browser.close()
    report['status']='passed'
except Exception as e:
    report['status']='failed';report['error']=str(e);raise
finally:
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'status':report['status'],'checks':len(report['checks']),'errors':report['errors']}))
