import assert from 'node:assert/strict';
import { createProject, addCollection, addFile, splitByCollection, projectLoad } from '../src/project.js';

const p = createProject('P');
addFile(p, 'r', 8, 8); // lands in Collection 1
addCollection(p, 'Sheets');
addFile(p, 's1', 8, 8, p.collections[1].id);
assert.ok(projectLoad(p) < 1);
// many tiny files barely register: the meter measures data, not file count
const crowd = createProject('crowd');
for (let i = 0; i < 200; i++) addFile(crowd, 'f' + i, 6, 6);
assert.ok(projectLoad(crowd) < 0.01, 'two hundred 6x6 files are nowhere near full');
const { parts, moved } = splitByCollection(p);
assert.equal(p.files.length, 2, 'first collection stayed (no root files)');
assert.equal(p.name, 'Collection 1');
assert.equal(parts.length, 1);
assert.equal(parts[0].name, 'Sheets');
assert.deepEqual(moved.map((f) => f.name), ['s1']);
assert.equal(parts[0].files[0].name, 's1');
console.log('project-split ok');
