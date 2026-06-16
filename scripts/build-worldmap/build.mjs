import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const world = require('world-atlas/countries-110m.json');

const W = 1000, H = 500;
const projection = geoEquirectangular().fitSize([W, H], { type: 'Sphere' });
const path = geoPath(projection);
const land = feature(world, world.objects.countries);
const d = land.features.map(f => path(f)).filter(Boolean).join(' ');

const svg = `<svg id="vmWorld" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="World map of site visitors" preserveAspectRatio="xMidYMid meet">
<path class="vm-land" d="${d}"/>
<g id="visitor-dots"></g>
</svg>`;

writeFileSync(new URL('../../assets/images/world-equirect.svg', import.meta.url), svg);
console.log('wrote assets/images/world-equirect.svg (' + svg.length + ' bytes)');
