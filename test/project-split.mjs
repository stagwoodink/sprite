import assert from 'node:assert/strict';
import { createProject, addCollection, addFile, splitByCollection, projectLoad } from '../src/project.js';

const p = createProject('P');
addFile(p, 'r', 8, 8); // lands in Collection 1
addCollection(p, 'Sheets');
addFile(p, 's1', 8, 8, p.collections[1].id);
assert.ok(projectLoad(p) < 1);
const { parts, moved } = splitByCollection(p);
assert.equal(p.files.length, 2, 'first collection stayed (no root files)');
assert.equal(p.name, 'Collection 1');
assert.equal(parts.length, 1);
assert.equal(parts[0].name, 'Sheets');
assert.deepEqual(moved.map((f) => f.name), ['s1']);
assert.equal(parts[0].files[0].name, 's1');
console.log('project-split ok');
