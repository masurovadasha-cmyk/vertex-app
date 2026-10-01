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
                    if data.get('revision')=='vision-views-active-rc1' and release.get('revision')=='vision-views-active-rc1':break
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
                            if parsed.path == '/api/v1/context':
                                route.fulfill(status=200,content_type='application/json',body=json.dumps({
                                    'actorId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                                    'tenantId':'11111111-1111-4111-8111-111111111111',
                                    'organizationId':'44444444-4444-4444-8444-444444444444',
                                    'module':'views','moduleEnabled':True,'guestLinked':False,
                                    'roles':['views-manager'],
                                    'permissions':['views.operations.read','views.booking.manage','views.cleaning.execute','views.cleaning.verify'],
                                    'capabilities':{'read_operations':True,'create_booking':False,'manage_booking':True,'execute_cleaning':True,'verify_cleaning':True}
                                }));return
                            if parsed.path == '/api/v1/work-feed':
                                route.fulfill(status=200,content_type='application/json',body=json.dumps({
                                    'generatedAt':'2026-10-01T01:00:00.000Z',
                                    'tasks':[{'id':'55555555-5555-4555-8555-555555555555','type':'task','source':'core.task','title':'Prepare TEST-235','status':'NEW','priority':'HIGH','dueAt':'2026-10-01T00:30:00.000Z','assignedToMe':False,'sourceId':'66666666-6666-4666-8666-666666666666','createdAt':'2026-10-01T00:00:00.000Z','updatedAt':'2026-10-01T00:30:00.000Z','version':1,'orderVersion':1,'assignedUserId':None,'slaState':'BREACHED','actions':['task_assign']}],
                                    'approvals':[{'id':'77777777-7777-4777-8777-777777777777','type':'approval','source':'vision.approval','kind':'maintenance.spend','title':'Approve repair','status':'PENDING','priority':'NORMAL','dueAt':None,'assignedToMe':True,'sourceId':None,'createdAt':'2026-10-01T00:00:00.000Z','updatedAt':'2026-10-01T00:00:00.000Z','version':1,'orderVersion':None,'assignedUserId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','slaState':'NONE','actions':['approval_approve','approval_reject'],'entityType':'unit','entityId':'22222222-2222-4222-8222-222222222222','requestedBy':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}],
                                    'attention':[{'id':'88888888-8888-4888-8888-888888888888','type':'attention','source':'core.order','title':'Order TEST-HIGH','status':'IN_PROGRESS','priority':'HIGH','reason':'HIGH_PRIORITY_REQUEST','dueAt':None,'assignedToMe':None,'sourceId':'88888888-8888-4888-8888-888888888888','createdAt':'2026-10-01T00:00:00.000Z','updatedAt':None,'version':None,'orderVersion':None,'assignedUserId':None,'slaState':None,'actions':[]}],
                                    'requests':[{'id':'99999999-9999-4999-8999-999999999999','type':'request','source':'core.order','title':'Order TEST-REQ','status':'NEW','priority':'NORMAL','dueAt':None,'assignedToMe':None,'sourceId':'99999999-9999-4999-8999-999999999999','createdAt':'2026-10-01T00:00:00.000Z','updatedAt':'2026-10-01T00:00:00.000Z','version':None,'orderVersion':None,'assignedUserId':None,'slaState':None,'actions':[]}],
                                    'counts':{'tasks':1,'approvals':1,'attention':1,'requests':1}
                                }));return
                            if parsed.path == '/api/v1/work-assignees':
                                route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':'cccccccc-cccc-4ccc-8ccc-cccccccccccc','displayName':'Synthetic Cleaner'}]));return
                            if parsed.path == '/api/v1/work/commands':
                                route.fulfill(status=200,content_type='application/json',body=json.dumps({'entityType':'task','taskId':'55555555-5555-4555-8555-555555555555','taskStatus':'ASSIGNED','taskVersion':2,'orderId':'66666666-6666-4666-8666-666666666666','orderStatus':'ACCEPTED','orderVersion':2,'correlationId':'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}));return
                            if parsed.path.startswith('/api/v1/views/'):
                                if parsed.path.endswith('/units'):
                                    route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':'22222222-2222-4222-8222-222222222222','unit_number':'TEST-235','unit_type':'apartment','status':'READY'}]));return
                                if parsed.path.endswith('/bookings'):
                                    route.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':'33333333-3333-4333-8333-333333333333','unit_id':'22222222-2222-4222-8222-222222222222','public_no':'VB-TEST','check_in':'2026-10-10','check_out':'2026-10-12','status':'CONFIRMED','currency':'USD','total':1200,'version':2,'created_at':'2026-09-30T12:00:00Z'}]));return
                                if parsed.path.endswith('/cleaning'):
                                    route.fulfill(status=200,content_type='application/json',body='[]');return
                                if parsed.path.endswith('/commands'):
                                    route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True}));return
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
                    check(str(width)+': Interface System 7 runtime',page.evaluate("document.documentElement.dataset.visionUi==='7.0'"))
                    check(str(width)+': five grouped module categories',page.locator('[data-vv-category]').count()==5)
                    check(str(width)+': every module uses a line SVG icon',page.locator('.vv-card-icon svg').count()==19)
                    check(str(width)+': Today context rail is visible',page.locator('#visionHome .vv-today').is_visible())
                    check(str(width)+': Today keeps honest empty states','—' in page.locator('#visionHome .vv-today').inner_text())
                    check(str(width)+': all modules depend on the core, not on Views',page.evaluate("VertexVision.core.modules.every(m=>m.parent==='vertex-vision' && m.dependencies.join()==='vision-core')"))
                    check(str(width)+': Views-only RC disclosure','Views активен' in page.locator('#visionHome .vv-disclosure').inner_text())
                    check(str(width)+': only Views is active',page.evaluate("VertexVision.core.modules.filter(m=>m.status==='active').map(m=>m.id).join(',')==='views'"))
                    check(str(width)+': 18 future modules are Coming Soon',page.evaluate("VertexVision.core.modules.filter(m=>m.status==='coming-soon').length===18"))
                    check(str(width)+': no horizontal document overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
                    page.evaluate("localStorage.removeItem('vertex.vision.preferences.v1')")
                    page.keyboard.press('Control+K')
                    check(str(width)+': command palette opens',page.locator('#visionCommandPalette').is_visible())
                    page.evaluate("VertexVision.openPalette()")
                    page.wait_for_selector('[data-vv-palette-module]')
                    check(str(width)+': command palette renders module results',page.locator('[data-vv-palette-module]').count()>0)
                    page.locator('#visionCommandPalette .vv-palette-input').fill('engineers')
                    check(str(width)+': command palette filters modules',page.locator('[data-vv-palette-module]').count()==1)
                    page.locator('[data-vv-palette-module="engineers"]').click()
                    check(str(width)+': palette selection opens module preview',page.locator('#visionModuleDialog').is_visible())
                    page.locator('[data-vv-favorite="engineers"]').click()
                    check(str(width)+': favorite is persisted locally',page.evaluate("JSON.parse(localStorage.getItem('vertex.vision.preferences.v1')).favorites.includes('engineers')"))
                    page.keyboard.press('Escape')
                    check(str(width)+': Today shows recent module',page.locator('#visionRecent').get_by_text('VERTEX Engineers').count()>0)
                    check(str(width)+': Today shows favorite module',page.locator('#visionFavorites').get_by_text('VERTEX Engineers').count()>0)
                    check(str(width)+': My Day opens from Hub',page.evaluate("VertexVision.openWorkCenter('today')"))
                    check(str(width)+': Work Center is visible',page.locator('#visionWorkCenter').is_visible())
                    check(str(width)+': Work Center has five tabs',page.locator('#visionWorkCenter [data-vvw-tab]').count()==5)
                    check(str(width)+': Work Feed remains explicitly disconnected','не подключ' in page.locator('#visionWorkCenter').inner_text().lower())
                    page.locator('#visionWorkCenter [data-vvw-tab="operations"]').click()
                    check(str(width)+': disconnected operations show dash','—' in page.locator('#visionWorkCenter .vvw-main').inner_text())
                    page.keyboard.press('Escape')
                    page.screenshot(path=str(OUT/f'vision-home-{width}.png'))
                    page.locator('#visionSearch').fill('laundry');check(str(width)+': module search',page.locator('[data-vv-open]').count()==1)
                    check(str(width)+': search preserves one matching category',page.locator('[data-vv-category]').count()==1)
                    page.locator('#visionSearch').fill('');page.locator('#visionDomain').select_option('services');check(str(width)+': service filter',page.locator('[data-vv-open]').count()==3)
                    page.locator('#visionDomain').select_option('')
                    for module in page.evaluate('VertexVision.core.modules.map(m=>m.id)'):
                        page.locator('[data-vv-open="'+module+'"]').click()
                        check(str(width)+': '+module+' detail opens',page.locator('#visionModuleDialog').is_visible())
                        check(str(width)+': '+module+' concept panel renders',page.locator('#visionModuleDialog .vv-module-preview').count()==1)
                        check(str(width)+': '+module+' dialog fits',page.locator('#visionModuleDialog').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                        page.keyboard.press('Escape')
                    page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
                    check(str(width)+': Views operations adapter is launchable',page.evaluate("VertexVision.navigate('views','operations')"))
                    check(str(width)+': disconnected operations state is explicit',page.locator('#visionViewsOperations .vvo-connect').is_visible())
                    page.keyboard.press('Escape')
                    if not live:
                        page.evaluate("VertexVisionViews.configure({tenantId:'11111111-1111-4111-8111-111111111111',organizationId:'44444444-4444-4444-8444-444444444444',token:'test.jwt.token'})")
                        check(str(width)+': configured Views operations opens',page.evaluate("VertexVision.navigate('views','operations')"))
                        page.wait_for_selector('#visionViewsOperations .vvo-kpis')
                        check(str(width)+': real-data workspace renders mocked unit',page.locator('#visionViewsOperations').get_by_text('TEST-235').count()>0)
                        check(str(width)+': operations status reports one unit',page.evaluate("VertexVisionViews.status().counts.units===1"))
                        check(str(width)+': UI permissions come from server context',page.evaluate("VertexVisionViews.status().permissions.includes('views.booking.manage') && VertexVisionViews.status().roles.join(',')==='views-manager'"))
                        page.keyboard.press('Escape')
                        check(str(width)+': configured Work Center opens operations',page.evaluate("VertexVision.openWorkCenter('operations')"))
                        check(str(width)+': Work Center sees configured Views session',page.evaluate("VertexVisionWorkCenter.status().viewsConfigured===true"))
                        page.wait_for_function("VertexVisionWorkCenter.status().workFeedConnected===true")
                        check(str(width)+': Unified Work Feed is connected',page.evaluate("VertexVisionWorkCenter.status().workFeedConnected===true"))
                        check(str(width)+': Work Feed counts are authoritative fixtures',page.evaluate("VertexVisionWorkCenter.status().counts.tasks===1 && VertexVisionWorkCenter.status().counts.approvals===1 && VertexVisionWorkCenter.status().counts.attention===1 && VertexVisionWorkCenter.status().counts.requests===1"))
                        check(str(width)+': Work Center uses polling not fake push realtime',page.evaluate("VertexVisionWorkCenter.status().refreshMode==='polling-30s'"))
                        page.locator('#visionWorkCenter [data-vvw-tab="tasks"]').click()
                        check(str(width)+': server task appears in My Day',page.locator('#visionWorkCenter').get_by_text('Prepare TEST-235').count()>0)
                        check(str(width)+': SLA breach is visible',page.locator('#visionWorkCenter .vvw-sla-breached').count()==1)
                        check(str(width)+': server-approved assignment action renders',page.locator('#visionWorkCenter [data-vvw-action="task_assign"]').count()==1)
                        check(str(width)+': eligible assignee selector renders',page.locator('#visionWorkCenter [data-vvw-assignee]').count()==1)
                        page.locator('#visionWorkCenter [data-vvw-tab="approvals"]').click()
                        check(str(width)+': approval appears',page.locator('#visionWorkCenter').get_by_text('Approve repair').count()>0)
                        check(str(width)+': approval actions come from server action list',page.locator('#visionWorkCenter [data-vvw-action="approval_approve"]').count()==1 and page.locator('#visionWorkCenter [data-vvw-action="approval_reject"]').count()==1)
                        check(str(width)+': approval decisions flag is server-derived',page.evaluate("VertexVisionWorkCenter.status().approvalDecisionsEnabled===true"))
                        page.locator('#visionWorkCenter [data-vvw-tab="operations"]').click()
                        check(str(width)+': Work Center renders authoritative Views counts',page.locator('#visionWorkCenter .vvw-stat').count()==4)
                        page.locator('#visionWorkCenter [data-vvw-views="calendar"]').click()
                        check(str(width)+': Work Center quick action opens Views calendar',page.evaluate("VertexVisionViews.status().tab==='calendar'") and page.locator('#visionViewsOperations').is_visible())
                        page.keyboard.press('Escape')
                        page.evaluate("VertexVisionViews.clearSession()")
                    check(str(width)+': Views adapter remains launchable',page.evaluate("VertexVision.navigate('views','host')"))
                    check(str(width)+': existing Views UI opens',page.locator('.vh-shell').first.is_visible())
                    for module,action in [('taxi','taxi'),('travel','packages'),('cleaning','cleaning-request'),('concierge','guest-guide')]:
                        page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
                        check(str(width)+': future adapter blocked '+module,page.evaluate('([m,a])=>VertexVision.navigate(m,a)===false',[module,action]))
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
