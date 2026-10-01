#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors=[]

def load(path):
    try:
        return json.loads((ROOT/path).read_text())
    except Exception as e:
        errors.append(f"invalid json {path}: {e}")
        return {}

sm=load(Path('contracts/ride-state-machine.json'))
states=set(sm.get('states',[]))
terminal=set(sm.get('terminal',[]))
seen=set()
for t in sm.get('transitions',[]):
    key=(t.get('from'),t.get('command'),t.get('to'))
    if key in seen: errors.append(f'duplicate transition {key}')
    seen.add(key)
    if t.get('from') not in states or t.get('to') not in states: errors.append(f'unknown state in {key}')
    if t.get('from') in terminal: errors.append(f'terminal state has outgoing transition {key}')

api=load(Path('contracts/api-v1.json'))
mutations=[x for group in ('passenger','driver','control','integration') for x in api.get(group,[]) if x.startswith('POST ')]
if not mutations: errors.append('no mutation endpoints')

events=load(Path('contracts/events-v1.json')).get('events',[])
if len(events)!=len(set(events)): errors.append('duplicate event names')

vision=load(Path('contracts/taxi-vision-integration-v1.json'))
if vision.get('databaseAccessFromVision') is not False: errors.append('Vision DB access must be false')
if vision.get('redisAccessFromVision') is not False: errors.append('Vision Redis access must be false')
if vision.get('mutations',{}).get('idempotencyRequired') is not True: errors.append('integration mutations must require idempotency')

ui=load(Path('contracts/ui-state-machine.json'))
if ui.get('pageScroll') is not False: errors.append('UI must be single-screen / no page scroll')

sql=(ROOT/'infra/sql/001_core_schema.sql').read_text()
for required in ['postgis','taxi_ride.rides','taxi_ride.offers','taxi_ledger.entries','taxi_integration.idempotency','taxi_integration.outbox']:
    if required.lower() not in sql.lower(): errors.append(f'missing schema element {required}')

if errors:
    print('ARCHITECTURE CHECK: FAIL')
    for e in errors: print(' -',e)
    raise SystemExit(1)
print('ARCHITECTURE CHECK: PASS')
print(f'states={len(states)} transitions={len(seen)} events={len(events)} mutation_endpoints={len(mutations)}')
