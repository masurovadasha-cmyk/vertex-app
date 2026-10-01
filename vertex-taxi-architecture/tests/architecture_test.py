import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def test_state_machine_has_no_terminal_outgoing_edges():
    sm=json.loads((ROOT/'contracts/ride-state-machine.json').read_text())
    terminal=set(sm['terminal'])
    assert all(t['from'] not in terminal for t in sm['transitions'])

def test_events_unique_and_versioned():
    e=json.loads((ROOT/'contracts/events-v1.json').read_text())
    assert e['version']==1
    assert len(e['events'])==len(set(e['events']))

def test_vision_has_no_database_or_redis_dependency():
    c=json.loads((ROOT/'contracts/taxi-vision-integration-v1.json').read_text())
    assert c['databaseAccessFromVision'] is False
    assert c['redisAccessFromVision'] is False

def test_ui_is_single_screen():
    u=json.loads((ROOT/'contracts/ui-state-machine.json').read_text())
    assert u['viewport']=='single-screen'
    assert u['pageScroll'] is False
