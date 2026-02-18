#!/usr/bin/env node

/**
 * List All Tools Script
 * 
 * This script lists all tool names by scanning the server tool files.
 *
 * Note: In this repo, the runtime entrypoint uses the compiled build in `build/src/`.
 * Some TS source files may not exist, so we default to scanning `build/src/tools/*.js`.
 */

import { readFileSync } from 'fs';

console.log("🛠️  Complete Tool List");
console.log("====================");

const toolFiles = [
  // Runtime files (compiled)
  'build/src/tools/campaigns.js',
  'build/src/tools/analytics.js',
  'build/src/tools/audiences.js',
  'build/src/tools/creatives.js',
  'build/src/tools/oauth.js',
];

let totalTools = 0;

toolFiles.forEach(file => {
  try {
    const content = readFileSync(file, 'utf8');
    const toolMatches = content.match(/server\.tool\(\s*["']([^"']+)["']/g) || [];
    
    const toolNames = toolMatches.map(match => {
      const nameMatch = match.match(/["']([^"']+)["']/);
      return nameMatch ? nameMatch[1] : '';
    }).filter(name => name);
    
    console.log(`\n📁 ${file.replace('build/src/tools/', '').replace('src/tools/', '').replace(/\.(ts|js)$/, '').toUpperCase()} (${toolNames.length} tools):`);
    toolNames.forEach(name => {
      console.log(`   • ${name}`);
    });
    
    totalTools += toolNames.length;
  } catch (error) {
    console.error(`❌ Error reading ${file}:`, error.message);
  }
});

console.log(`\n📊 Total: ${totalTools} tools`);
console.log("\n✅ All tools listed successfully!");