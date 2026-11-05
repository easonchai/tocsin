// Regenerates site/erc.html from erc/eip-draft_threat_flag_log.md.
// Usage: node scripts/build-erc.mjs   (needs `npm install` for marked)
import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const root = new URL('..', import.meta.url).pathname;
const md = readFileSync(`${root}erc/eip-draft_threat_flag_log.md`, 'utf8');
const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
const body = md.slice(fm[0].length);

const preamble = fm[1].split('\n').map((line) => {
  const i = line.indexOf(':');
  return `<div><span class="f">${line.slice(0, i)}</span> ${line.slice(i + 1).trim()}</div>`;
}).join('');

const html = marked.parse(
  body
    .replace(/\]\(\.\/eip-(\d+)\.md\)/g, '](https://eips.ethereum.org/EIPS/eip-$1)')
    .replace(/\]\(\.\.\/LICENSE\.md\)/g, '](https://github.com/ethereum/ERCs/blob/master/LICENSE.md)'),
);

const pagePath = `${root}site/erc.html`;
let page = readFileSync(pagePath, 'utf8');
page = page.replace(/<div class="preamble">[\s\S]*?<\/div>\n/, `<div class="preamble">${preamble}</div>\n`);
const start = page.indexOf('</div>\n  <h2');
const end = page.lastIndexOf('<p class="back"');
page = `${page.slice(0, start + 7)}  ${html}\n  ${page.slice(end)}`;
writeFileSync(pagePath, page);
console.log(`wrote ${pagePath}`);
