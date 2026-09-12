// Read-only pixel audit: ensure the calibrated sample edges contain no neighboring artwork.
const sharp=require('sharp'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const {data,info}=await sharp(path.join(__dirname,'../assets/v4.2/sprites-v2.webp')).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,1536);assert.equal(info.height,1024);
  const names=['土豆','白菜','胡萝卜','辣椒','番茄','玉米','小麦','南瓜','豆类','草莓','水稻','药草','兔','鸡','鸭','羊','猪','马','牛','鹅','山羊','空地','幼苗','饲槽'];
  const rows=[24,256,488,728];
  for(let index=0;index<24;index++){
    const left=(index%6)*256,top=rows[Math.floor(index/6)];let foreground=0;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      if(x>=8&&x<248&&y>=8&&y<248)continue;
      const offset=((top+y)*info.width+left+x)*info.channels;
      if(data[offset]<155||data[offset+1]<145||data[offset+2]<110)foreground++;
    }
    assert.equal(foreground,0,names[index]+' 的8px取样边缘含前景色，需人工复查裁切');
    console.log(names[index]+'：边缘干净');
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
