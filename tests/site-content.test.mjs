import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = relativePath => readFileSync(join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const scriptsJs = read('scripts.js');
const stylesCss = read('styles.css');

const consoleHero = indexHtml.match(
  /<header class="hero" id="top">[\s\S]*?<\/header>/,
);
const defaultProfileImage = indexHtml.match(/<img[\s\S]*?class="profile-image default"[\s\S]*?>/);

assert.ok(consoleHero, 'expected the restored console hero on the homepage');
assert.ok(defaultProfileImage, 'expected a default profile image in the homepage hero');
assert.match(
  consoleHero[0],
  /<h1 class="hero-title">Haokai Ding<\/h1>/,
  'expected the homepage hero to expose a real h1 for document structure and SEO',
);
assert.match(
  consoleHero[0],
  /I am an M\.Sc\. student in Robotics at[\s\S]*Mohamed bin Zayed University of Artificial Intelligence \(MBZUAI\)/,
  'expected the homepage to identify the MBZUAI affiliation',
);
assert.match(
  consoleHero[0],
  /href="assets\/pdfs\/haokai-ding-cv\.pdf"[^>]*>CV<\/a>/,
  'expected the homepage to link to the current CV PDF',
);
assert.match(
  indexHtml,
  /<span class="site-mark-prompt">:~#<\/span>/,
  'expected the restored console prompt in the site mark',
);
assert.match(
  indexHtml,
  /<button id="theme-switcher" type="button" aria-label="Toggle dark mode">/,
  'expected the restored console theme switcher',
);
assert.doesNotMatch(
  indexHtml,
  /<aside class="sidebar"|class="page-layout"|class="hero-statement"/,
  'expected the sidebar redesign to be absent from the restored homepage',
);
assert.match(
  indexHtml,
  /<link rel="canonical" href="https:\/\/haokaiding\.github\.io\/" \/>/,
  'expected the GitHub Pages canonical host to remain unchanged',
);
assert.match(
  indexHtml,
  /<meta property="og:url" content="https:\/\/haokaiding\.github\.io\/" \/>/,
  'expected Open Graph metadata to retain the GitHub Pages host',
);
assert.match(
  indexHtml,
  /"jobTitle": "M\.Sc\. Student in Robotics"/,
  'expected structured data to preserve the current degree status',
);
assert.match(
  defaultProfileImage[0],
  /fetchpriority="high"/,
  'expected the default hero image to be marked as a high-priority fetch',
);
assert.doesNotMatch(
  defaultProfileImage[0],
  /loading="lazy"/,
  'expected the default hero image to avoid lazy loading because it is above the fold',
);
assert.doesNotMatch(
  indexHtml,
  /<h2>visitors<\/h2>/i,
  'expected the visitor section to stop presenting itself like a main content heading',
);
assert.match(
  indexHtml,
  /class="footer-label"/,
  'expected the footer to use a lower-emphasis visitor label',
);
assert.doesNotMatch(
  indexHtml,
  /mapmyvisitors|clustrmaps/i,
  'expected the third-party visitor-map widget to be fully removed',
);
assert.match(
  indexHtml,
  /id="visitor-dots"/,
  'expected the inline world-map SVG with a dots group to be present',
);
assert.match(
  indexHtml,
  /assets\/js\/visitor-map\.js/,
  'expected the self-hosted visitor-map module to be loaded',
);
assert.match(
  indexHtml,
  /href="https:\/\/visitors\.haokaiding\.qzz\.io\/stats"/,
  'expected the footer map to link through to the public stats page',
);
assert.match(
  scriptsJs,
  /const explicitDate = target\.getAttribute\('datetime'\)\?\.trim\(\);/,
  'expected updateLastUpdated to respect an explicit content date before any fallback',
);
assert.match(
  scriptsJs,
  /trigger:\s*'\.image-link'/,
  'expected scripts.js to register image-link clicks in the shared modal registry',
);
assert.match(
  scriptsJs,
  /event\.target\.closest\(entry\.trigger\)/,
  'expected scripts.js to handle modal triggers via a single delegated handler (no double binding)',
);
assert.match(
  scriptsJs,
  /themeSwitcher\?\.addEventListener\('click'/,
  'expected the restored dark-mode control to remain functional',
);
assert.match(
  stylesCss,
  /\.image-panel\s*\{[^}]*width:\s*min\(92vw,\s*420px\)/,
  'expected the QR image modal to use a smaller width cap',
);
assert.match(
  stylesCss,
  /\.contact-block \.inline-link\s*\{[^}]*color:\s*inherit/,
  'expected the Wechat trigger in the contact list to inherit the same color as the other contact links',
);

console.log('site-content checks passed');
