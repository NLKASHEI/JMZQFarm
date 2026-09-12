// Re-encode the generated raster originals for delivery. No art is drawn in code.
const sharp = require('sharp');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'assets', 'v4.2');
Promise.all(['homestead','scenes','sprites','sprites-v2'].map(async name => {
  const result = await sharp(path.join(dir, name+'.png')).webp({quality:88, effort:6}).toFile(path.join(dir, name+'.webp'));
  console.log(name+': '+result.width+'×'+result.height+' / '+Math.round(result.size/1024)+' KB');
})).catch(error => {console.error(error);process.exitCode=1;});
