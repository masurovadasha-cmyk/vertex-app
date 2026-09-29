"""Browser regressions on a routed HTTPS origin using Chromium's real localStorage.
No production server or third-party integration is contacted. Fixtures are synthetic.
"""
from pathlib import Path
import json,mimetypes,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SITE=ROOT/'vertex/dist';OUT=ROOT/'artifacts/studio';OUT.mkdir(parents=True,exist_ok=True)
MEMORY=os.environ.get('VERTEX_MEMORY_TEST')=='1'
checks=[]
def check(name,value):
    checks.append({'name':name,'pass':bool(value)})
    if not value: raise AssertionError(name)
def run():
 with sync_playwright() as p:
  executable=os.environ.get('CHROMIUM_PATH')
  kw={'headless':True,'args':['--no-sandbox']}
  if executable:kw['executable_path']=executable
  browser=p.chromium.launch(**kw)
  ctx=browser.new_context(viewport={'width':390,'height':844},locale='ru-RU',timezone_id='Asia/Tashkent',service_workers='block',accept_downloads=True)
  def route(r):
   from urllib.parse import urlparse,unquote
   u=urlparse(r.request.url)
   if u.hostname!='vertex.test':r.abort();return
   f=(SITE/unquote(u.path).lstrip('/')).resolve()
   if u.path=='/':f=SITE/'index.html'
   if f.is_relative_to(SITE) and f.is_file():
    mime='application/javascript' if f.suffix=='.js' else 'image/avif' if f.suffix=='.avif' else mimetypes.guess_type(str(f))[0] or 'application/octet-stream'
    r.fulfill(status=200,body=f.read_bytes(),content_type=mime)
   else:r.fulfill(status=404,body='Not found')
  ctx.route('**/*',route)
  page=ctx.new_page();page.set_default_timeout(7000)
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def reload():
   nonlocal page
   if MEMORY:
    seed=page.evaluate('window.__testData||{}')
    old=page;page=ctx.new_page();page.set_default_timeout(7000);page.on('pageerror',lambda e:errors.append(str(e)));old.close()
    page.set_content(baseline.bundle(SITE,seed),wait_until='load')
   else:page.reload()
  if MEMORY:
   import importlib.util
   spec=importlib.util.spec_from_file_location('baseline',ROOT/'scripts/browser-quality.py');baseline=importlib.util.module_from_spec(spec);spec.loader.exec_module(baseline)
  def go(route):page.evaluate('(route)=>VertexHostConsole.open(route)',route);page.wait_for_timeout(80)
  def shot(name):page.wait_for_timeout(500);page.screenshot(path=str(OUT/(name+'.png')))
  try:
   if MEMORY:page.set_content(baseline.bundle(SITE),wait_until='load')
   else:page.goto('https://vertex.test/')
   page.wait_for_timeout(100)
   check('app boots on secure test origin',page.evaluate('!!VertexHostConsole') and not errors)
   shot('01-guest-home')
   page.locator('#hostPanel').click();check('main host button enters new workspace',page.locator('.vh-shell').count()==1);shot('02-host-today')
   page.evaluate('VertexProfileMenu.menu()');check('mobile profile menu uses new host menu',page.locator('.vh-menu-cards').count()==1);shot('03-host-menu')
   go('account');shot('04-account')
   for route_name in ['security','privacy','payments','permissions','business','tax','company']:
    go(route_name);check(route_name+' loads without fake enabled form',page.locator('.vh-card').count()==1 and page.locator('input[type=password]').count()==0)
   go('personal');page.locator('#hostDisplayName').fill('Демо-хозяин');page.locator('#saveHostPrefs').click();reload();go('personal');check('display name persists through reload in '+('memory storage double' if MEMORY else 'real localStorage'),page.locator('#hostDisplayName').input_value()=='Демо-хозяин')
   go('access');page.locator('[data-pref=largeText]').check();check('larger text updates rendered document',page.evaluate('document.documentElement.classList.contains("vertex-large-text")'))
   page.locator('[data-pref=reduceMotion]').check();reload();check('motion preference persists through reload',page.evaluate('document.documentElement.classList.contains("vertex-reduce-motion")'))
   go('access');shot('05-accessibility');page.locator('[data-pref=largeText]').uncheck()
   go('language');page.locator('#hostLang').select_option('en');check('language selector updates the document',page.evaluate('document.documentElement.lang')=='en');go('menu');check('host labels translate into English','Menu' in page.locator('.vh-head h2').inner_text());go('language');page.locator('#hostLang').select_option('ru')
   go('listings');shot('06-listings');pid=page.evaluate('VertexRentals.getSnapshot().properties.find(p=>p.ownerConfirmed).id')
   page.evaluate('(id)=>VertexHostConsole.listing(id)',pid);shot('07-listing-workspace');page.locator('[data-ha=photos]').first.click();shot('08-photo-tour');photo_count=page.locator('[data-photo]').count();check('photo tour includes all existing photos',photo_count>=2)
   page.locator('[data-photo]').first.click();first=page.locator('.vh-lightbox').get_attribute('src');page.locator('#photoNext').click();check('photo next changes the displayed photo',page.locator('.vh-lightbox').get_attribute('src')!=first);page.locator('#photoPrev').click();check('photo previous returns to same image',page.locator('.vh-lightbox').get_attribute('src')==first);shot('09-photo-viewer')
   go('calendar');check('calendar has all days and functional host navigation',page.locator('.cal-day').count()>=28 and page.locator('.vh-calendar-nav').count()==1);shot('10-calendar')
   page.locator('.vh-calendar-nav [data-ht=messages]').click();check('calendar links back to host messages',page.locator('#hostMessageSearch').count()==1)
   go('earnings');shot('11-earnings');go('messages');shot('12-messages-empty')
   # Synthetic booking and discussion fixtures for behavioral verification only.
   booking={'id':'studio-demo-booking','listingId':'utower','title':'Тестовая заявка','guest':'Демо-гость','guests':2,'arrival':'2026-10-12','departure':'2026-10-15','status':'Подтверждено','currency':'USD','total':120,'n':3,'created':'2026-09-29'}
   rental={'listings':[],'favorites':[],'blocks':[],'bookings':[booking,{**booking,'id':'studio-demo-uzs','currency':'UZS','total':350000}], 'threads':[{'listingId':'utower','messages':[{'side':'guest','text':'Тестовое сообщение без персональных данных','at':'2026-09-29T10:00:00Z'}]}]}
   page.evaluate('(v)=>'+('window.__testStore' if MEMORY else 'localStorage')+'.setItem("vertex-rentals-v1",JSON.stringify(v))',rental);reload();go('today');check('dashboard reads canonical booking state',page.locator('[data-booking]').count()==2)
   page.locator('[data-booking]').first.click();page.locator('#hostBookingNote').fill('Тестовая заметка');page.locator('#saveBookingNote').click();reload();page.evaluate('VertexHostConsole.booking("studio-demo-booking")');check('booking note survives browser reload',page.locator('#hostBookingNote').input_value()=='Тестовая заметка');shot('13-booking-details-demo')
   go('messages');page.locator('[data-mf=unread]').click();check('unread filter finds new discussion',page.locator('[data-message-row]:visible').count()==1);page.locator('[data-star]').click();reload();go('messages');page.locator('[data-mf=starred]').click();check('starred filter persists',page.locator('[data-message-row]:visible').count()==1)
   page.locator('#hostMessageSearch').fill('not-matching');check('message search shows empty state',page.locator('#hostMessageEmpty').is_visible());page.locator('#hostMessageSearch').fill('Тестовое');check('message text search restores thread',page.locator('[data-message-row]:visible').count()==1);shot('14-messages-demo')
   page.locator('[data-thread]').click();go('messages');page.locator('[data-mf=unread]').click();check('opening thread marks it read',page.locator('[data-message-row]:visible').count()==0)
   go('earnings');page.locator('#reportMonth').fill('2026-10');page.locator('#reportMonth').dispatch_event('change');check('USD report ignores UZS booking','120' in page.locator('.vh-earn-card h3').inner_text() and '350' not in page.locator('.vh-earn-card h3').inner_text())
   page.locator('#reportCurrency').select_option('UZS');check('UZS report is separately selectable','350' in page.locator('.vh-earn-card h3').inner_text())
   with page.expect_download() as download:page.locator('#reportExport').click()
   f=OUT/'demo-export.csv';download.value.save_as(f);text=f.read_text();check('CSV includes filtered currency only','350000' in text and '"USD"' not in text)
   page.evaluate("window.__testFail=true" if MEMORY else "() => { Storage.prototype.setItem=function(){throw new DOMException('Quota','QuotaExceededError')}; }");go('personal');page.locator('#hostDisplayName').fill('Must not save');page.locator('#saveHostPrefs').click();check('storage denial reports an error',page.locator('#hostSaveError').inner_text()!='');reload();go('personal');check('failed write does not replace persisted name',page.locator('#hostDisplayName').input_value()=='Демо-хозяин')
   for width in [320,390,768,1440]:
    page.set_viewport_size({'width':width,'height':900})
    for r in ['today','menu','listings','account','earnings','messages','access']:
     go(r);check(f'{r} at {width}px has no horizontal overflow',page.locator('#modal').evaluate('el=>el.scrollWidth<=el.clientWidth+1'))
    if width==1440:go('listings');shot('15-desktop-workspace')
   check('no uncaught JS errors during complete studio suite',not errors)
  finally:
   (OUT/'browser-studio-tests.json').write_text(json.dumps({'environment':('explicit in-memory DOM test double, not persistent storage' if MEMORY else 'routed HTTPS test origin; real Chromium localStorage; no live backend'),'checks':checks,'uncaught_errors':errors},ensure_ascii=False,indent=2));browser.close()
 print('PASS',len(checks),'studio browser assertions')
if __name__=='__main__':run()
