// Optional real-browser layout audit. Set FARM_PLAYWRIGHT_DEPS if Playwright is not installed locally.
const {chromium}=require(process.env.FARM_PLAYWRIGHT_DEPS||'playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../tests/.artifacts');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.FARM_CHROMIUM_PATH||undefined});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.FARM_PREVIEW_URL||'http://127.0.0.1:8765/JMZQFarm/preview/scene.html');
    await page.locator('[data-tab="explore"]').first().waitFor();
    for(const width of [1160,980,760,720,390,320]){
      await page.setViewportSize({width,height:850});
      for(const theme of ['light','dark']){
        if(!await page.locator('.garden.'+theme).count())await page.locator('[data-ui="theme"]').click();
        await page.locator('.garden.'+theme).waitFor({state:'attached'});
        for(const tab of ['explore','fish','workshop','idle','achievements']){
          await page.locator('nav [data-tab="'+tab+'"]').click();
          await page.locator('main[data-page="'+tab+'"]').waitFor();
          await page.evaluate(()=>new Promise(requestAnimationFrame));
          const problems=await page.evaluate(()=>{
            const r=document.querySelector('#jmzq-garden').shadowRoot,result=[];
            const rect=e=>e.getBoundingClientRect(),overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
            for(const tile of r.querySelectorAll('.scene-tile')){
              const a=rect(tile),p=rect(tile.parentElement);if(a.width<20||a.height<20)result.push('collapsed scene');
              if(a.left<p.left-1||a.right>p.right+1)result.push('scene outside parent');
              for(const sibling of tile.parentElement.children)if(sibling!==tile&&overlap(a,rect(sibling)))result.push('scene overlaps '+sibling.className);
              const art=rect(tile.querySelector('.scene-art'));if(Math.abs(art.width/art.height-2.25)>.03)result.push('distorted scene');
            }
            for(const e of r.querySelectorAll('.zone-copy,.achievement-card,.achievement-detail,.achievement-title,.achievement-prize,.achievement-rewards'))if(e.scrollWidth>e.clientWidth+2)result.push('text overflow '+e.className);
            const m=r.querySelector('main');if(m.scrollWidth>m.clientWidth+1)result.push('main horizontal overflow');
            return result;
          });
          assert.deepEqual(problems,[],width+' '+theme+' '+tab);
          if([1160,390,320].includes(width)&&['explore','achievements'].includes(tab)){
            await page.locator('main img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
            await page.screenshot({path:path.join(out,tab+'-'+width+'-'+theme+'.png')});
          }
        }
      }
      console.log(width+'px: light/dark exploration, fishing, workshop, idle, achievements OK');
    }
    await page.setViewportSize({width:320,height:850});
    await page.locator('nav [data-tab="achievements"]').click();
    for(const category of ['farm','ranch','fish','explore','craft','home']){
      await page.locator('[data-do="achievement-filter"][data-id="'+category+'"]').click();
      let next=true;
      while(next){
        const ids=await page.locator('.achievement-card').evaluateAll(els=>els.map(e=>e.dataset.id));
        for(const id of ids){
          await page.locator('[data-do="select-achievement"][data-id="'+id+'"]').click();
          await page.locator('.achievement-detail .medal img').evaluate(img=>img.decode());
          const problems=await page.locator('.achievement-detail').evaluate(detail=>{
            const r=e=>e.getBoundingClientRect(),a=r(detail.querySelector('.achievement-rewards')),b=r(detail.querySelector('[data-do="milestone"]'));
            return [...detail.querySelectorAll('p,h3,b,small,button')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.textContent).concat(a.bottom>b.top+1?['reward overlaps button']:[]);
          });
          assert.deepEqual(problems,[],id+' 320px detail');
        }
        const button=page.getByRole('button',{name:'下一页 ›',exact:true});next=await button.isEnabled();if(next)await button.click();
      }
    }
    assert.deepEqual(errors,[]);console.log('60 real-browser layout checks + all 32 achievement details at 320px passed');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
