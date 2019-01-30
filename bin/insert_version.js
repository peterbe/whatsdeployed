#!/usr/bin/env node
const fs = require('fs');

const versionFile = process.argv[2];
if (!versionFile) throw new Error('missing file argument');
const versionString = fs.readFileSync(versionFile, 'utf8');
const data = JSON.parse(versionString);

const htmlFile = process.argv[3];
if (!htmlFile) throw new Error('missing file argument');
let html = fs.readFileSync(htmlFile, 'utf8');

let tag = '<div id="_version" ';
const keeps = ['commit', 'date'];
Object.entries(data).forEach(([key, value]) => {
  if (keeps.includes(key)) {
    tag += `data-${key}="${value}" `;
  }
});
tag = tag.trim() + '/>';

const newHtml = html.replace(/<div id="_version" [^>]+>/, tag);
fs.writeFileSync(htmlFile, newHtml, 'utf8');
