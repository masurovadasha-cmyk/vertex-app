const test=require('node:test'),assert=require('node:assert/strict');
const {date,validContext,validStop,sortStops,normalize,escape}=require('./vertex/dist/journey.js');
test('strict calendar dates reject overflow and accept leap day',()=>{assert.equal(date('2026-02-30'),false);assert.equal(date('2028-02-29'),true);assert.equal(date('2026-13-01'),false);});
test('journey validates city, interval, integer party',()=>{const c={city:'Tashkent',start:'2026-10-12',end:'2026-10-15',guests:2};assert.equal(validContext(c),true);for(const x of [{...c,end:c.start},{...c,guests:2.5},{...c,city:'other'},{...c,end:'2028-10-12'}])assert.equal(validContext(x),false);});
test('restored malformed data rejected without inventing a plan',()=>{assert.deepEqual(normalize({context:{},stops:[null,{}],checks:[]}),{version:1,context:null,checks:{},stops:[]});});
test('itinerary sorts by day and time without mutating input',()=>{const s=[{date:'2026-10-13',time:'11:00'},{date:'2026-10-12',time:'14:00'}];assert.equal(sortStops(s)[0],s[1]);assert.equal(s[0].date,'2026-10-13');});
test('user text escaped in printable offline HTML',()=>assert.equal(escape('<script>"&'), '&lt;script&gt;&quot;&amp;'));
test('invalid scheduled times are rejected',()=>{const s={id:'a',trip:'x',date:'2026-10-12',time:'24:00',title:'Arrival',note:''};assert.equal(validStop(s),false);assert.equal(validStop({...s,time:'23:59'}),true);});
