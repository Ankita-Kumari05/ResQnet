import {
  extractRoadNameFromProperties,
  ensureUsableRoadLength,
} from './src/services/mapRoadFeatureService';
import type { Coordinate } from './src/types/routing';
import { distanceMeters } from './src/services/geometryUtils';

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
  } else {
    console.error(`[FAIL] ${msg}`);
    process.exit(1);
  }
}

console.log('====================================================');
console.log('ROAD IDENTIFICATION & GEOMETRY SERVICE TESTS');
console.log('====================================================');

// Test 1: Extract road names
const nameOnly = extractRoadNameFromProperties({ name: 'Sukhna Path' });
assert(nameOnly === 'Sukhna Path', 'Extracts name property correctly (Sukhna Path)');

const nameAndRef = extractRoadNameFromProperties({ name: 'Chandigarh-Kharar Highway', ref: 'NH-5' });
assert(nameAndRef === 'Chandigarh-Kharar Highway (NH-5)', 'Combines name and ref (Chandigarh-Kharar Highway (NH-5))');

const refOnly = extractRoadNameFromProperties({ ref: 'PR-7' });
assert(refOnly === 'Route PR-7', 'Extracts ref property as Route PR-7');

const classOnly = extractRoadNameFromProperties({ class: 'primary' }, [76.7794, 30.7333]);
assert(classOnly.includes('Primary Road'), 'Formats class property as Primary Road');

// Test 2: Usable road length extension for short vector tile segments
const shortSegment: Coordinate[] = [
  [76.7790, 30.7330],
  [76.7794, 30.7333],
];
const initialLen = distanceMeters(shortSegment[0], shortSegment[1]);
console.log(`Initial short segment length: ${Math.round(initialLen)}m`);
assert(initialLen < 60, 'Initial segment is under 60m');

const extended = ensureUsableRoadLength(shortSegment, 150);
let extendedLen = 0;
for (let i = 0; i < extended.length - 1; i++) {
  extendedLen += distanceMeters(extended[i], extended[i + 1]);
}
console.log(`Extended road length: ${Math.round(extendedLen)}m (${extended.length} coordinates)`);
assert(extendedLen >= 150, 'Extended LineString provides at least 150m for Two-Closure-Gate sliding');

console.log('\n====================================================');
console.log('ALL ROAD IDENTIFICATION TESTS PASSED');
console.log('====================================================');
