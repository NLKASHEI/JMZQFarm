// Isolated mouse/touch docking regressions. Uses the same env vars as check-floating.cjs.
const {chromium}=require(process.env.FARM_PLAYWRIGHT_DEPS||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const url=process.env.FARM_PREVIEW_URL||'http://127.0.0.1:8765/JMZQFarm/preview/scene.html';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.FARM_CHROMIUM_PATH||undefined});
  try{
    for(const mobile of [false,true]){
      const width=mobile?390:1100,height=mobile?844:900;
      const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);await page.locator('[data-ui="close"]').click();
      const bubble=page.locator('.bubble'),panel=page.locator('.panel');
      assert.equal(await bubble.textContent(),'🌾');
      async function peek(edge){
        await page.waitForFunction(edge=>document.querySelector('#jmzq-garden').shadowRoot.querySelector('.bubble').classList.contains('edge-peek-'+edge),edge);
        await page.waitForTimeout(260);
        const r=await bubble.boundingBox(),exposed=mobile?18:14;
        assert.ok(edge==='right'?Math.abs(width-r.x-exposed)<1:Math.abs(r.x+r.width-exposed)<1,JSON.stringify({mobile,edge,r,exposed}));
        assert.equal(r.width,mobile?34:40);assert.equal(r.height,mobile?34:40);
        const style=await bubble.evaluate(e=>({opacity:getComputedStyle(e).opacity,iconOpacity:getComputedStyle(e.querySelector('span')).opacity,clip:getComputedStyle(e).clipPath,shadow:getComputedStyle(e).boxShadow}));
        assert.equal(style.opacity,'0.72');assert.equal(style.iconOpacity,'0.38');assert.equal(style.clip,'none');assert.ok(style.shadow.includes('0.3'));
        assert.ok(r.y>=0&&r.y+r.height<=height);
        return r;
      }
      const initial=await peek('right');
      // Click/tap the exposed sliver, not the off-screen button center.
      if(mobile)await page.touchscreen.tap(width-8,initial.y+20);
      else{
        await page.mouse.move(width-7,initial.y+20);
        await page.waitForTimeout(300);
        assert.ok(!(await bubble.getAttribute('class')).includes('edge-peek'));
        await page.waitForTimeout(1100);
        assert.ok(!(await bubble.getAttribute('class')).includes('edge-peek'),'hover must hold it open');
        await page.mouse.click(width-7,initial.y+20);
      }
      await panel.waitFor({state:'visible'});
      await page.locator('[data-ui="close"]').click();await page.mouse.move(width/2,40);
      const cdp=mobile?await context.newCDPSession(page):null;
      async function drag(x,y){
        const r=await bubble.boundingBox();
        const startX=Math.max(6,Math.min(width-6,r.x+r.width/2)),startY=r.y+r.height/2;
        if(mobile){
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:startY}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        }else{
          await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(x,y,{steps:8});await page.mouse.up();await page.mouse.move(width/2,40);
        }
        await page.waitForTimeout(280);
        assert.equal(await panel.isVisible(),false,'drag does not open panel');
      }
      await peek('right');await drag(8,160);await peek('left');
      const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('jmzq_farm_floating_v1_preview')));
      assert.equal(stored.bubble.edge,'left');
      // Drag directly from the hidden handle back to the middle: no auto-hide there.
      await drag(width/2,300);await page.waitForTimeout(1100);
      assert.ok(!(await bubble.getAttribute('class')).includes('edge-peek'));
      assert.equal(await bubble.getAttribute('data-edge'),null);
      // Keyboard focus always reveals a docked handle, Enter still opens it.
      await drag(width-5,350);await peek('right');
      await page.keyboard.press('Tab');await bubble.focus();await page.waitForTimeout(1100);
      assert.ok(!(await bubble.getAttribute('class')).includes('edge-peek'));
      await page.keyboard.press('Enter');await panel.waitFor({state:'visible'});
      await page.locator('[data-ui="close"]').click();await page.mouse.move(width/2,40);
      await peek('right');
      await page.reload();await page.locator('[data-ui="close"]').click();await page.mouse.move(width/2,40);await peek('right');
      fs.mkdirSync(path.resolve(__dirname,'../tests/.artifacts'),{recursive:true});
      await page.screenshot({path:path.resolve(__dirname,'../tests/.artifacts/docked-'+(mobile?'mobile':'desktop')+'.png')});
      // Teardown with a pending timer must neither throw nor recreate an orphan launcher.
      await page.evaluate(()=>window._farmCleanup());await page.waitForTimeout(1250);
      assert.equal(await page.locator('#jmzq-garden').count(),0);assert.deepEqual(errors,[]);
      console.log((mobile?'Touch':'Mouse')+': peek both edges, handle hit, reveal, drag-out, no mid-screen hide, keyboard, reload and cleanup passed');
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
