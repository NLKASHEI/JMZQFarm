const esbuild = require('esbuild');
const path = require('node:path');
esbuild.build({
  entryPoints:[path.join(__dirname,'..','farm.js')],
  outfile:path.join(__dirname,'..','farm.min.js'),
  minify:true,charset:'utf8',target:'es2020',legalComments:'inline',
  banner:{js:'/* 缄默之秋小农场 4.2.0 · 秋日绘景版 */'},
}).catch(error=>{console.error(error);process.exitCode=1;});
