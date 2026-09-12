// Read-only atlas audit: validate 32 unique sample windows and blank crop borders.
const sharp=require('sharp'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {ACHIEVEMENT_ART,MILESTONES}=require('../farm.js');
(async()=>{
  const hashes=new Set();
  for(const sheet of new Set(Object.values(ACHIEVEMENT_ART).map(a=>a.sheet))){
    const {data,info}=await sharp(path.join(__dirname,'../assets/v4.2',sheet+'.webp')).removeAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,info.height*2,'atlas must have a 4x2 square-cell layout');
    for(const [id,art] of Object.entries(ACHIEVEMENT_ART).filter(([,a])=>a.sheet===sheet)){
      const row=Math.floor(art.cell/4)+(art.offsetY||0);
      const left=Math.round(art.cell%4*info.width/4),right=Math.round((art.cell%4+1)*info.width/4),top=Math.round(row*info.height/2),bottom=Math.round((row+1)*info.height/2);
      let foreground=0;const hash=crypto.createHash('sha256');
      for(let y=top;y<bottom;y++){
        hash.update(data.subarray((y*info.width+left)*info.channels,(y*info.width+right)*info.channels));
        for(let x=left;x<right;x++){
          if(x>=left+6&&x<right-6&&y>=top+6&&y<bottom-6)continue;
          const i=(y*info.width+x)*info.channels;if(data[i]<130||data[i+1]<120||data[i+2]<90)foreground++;
        }
      }
      assert.equal(foreground,0,id+' crop border contains dark foreground; inspect neighboring artwork');
      const digest=hash.digest('hex');assert.equal(hashes.has(digest),false,id+' duplicates another sample');hashes.add(digest);
      console.log(MILESTONES.find(g=>g.id===id).name+' — '+sheet+'/'+art.cell+'：独立图案，边缘干净');
    }
  }
  assert.equal(hashes.size,32);
})().catch(e=>{console.error(e);process.exitCode=1;});
