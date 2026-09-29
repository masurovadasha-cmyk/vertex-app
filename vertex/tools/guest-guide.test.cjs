const assert=require('node:assert/strict');
const {rules}=require('../dist/guest-guide.js');
assert.equal(rules.accessCode,'arrival-day-before-14:00');
assert.equal(rules.smoking,'balcony-only');
assert.equal(rules.quietWeekday,'23:00');
assert.equal(rules.quietWeekend,'22:00');
assert.equal(rules.pets,'approval-required');
assert.deepEqual(rules.parking,['ground','underground']);
console.log('PASS Vertex Guest Guide rules');
