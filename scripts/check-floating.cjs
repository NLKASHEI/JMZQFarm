// Real browser pointer/viewport regressions; all pages use a fresh isolated preview profile.
const {chromium}=require(process.env.FARM_PLAYWRIGHT_DEPS||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.FARM_CHROMIUM_PATH||undefined});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    const url=process.env.FARM_PREVIEW_URL||'http://127.0.0.1:8765/JMZQFarm/preview/scene.html';
    await page.goto(url);await page.locator('[data-ui="close"]').tap();
    const box=()=>page.locator('.bubble').boundingBox();
    async function inside(selector='.bubble',viewport={x:0,y:0,width:390,height:844}){
      const r=await page.locator(selector).boundingBox();assert.ok(r,'visible '+selector);
      assert.ok(r.x>=viewport.x&&r.y>=viewport.y&&r.x+r.width<=viewport.x+viewport.width+1&&r.y+r.height<=viewport.y+viewport.height+1,JSON.stringify({selector,r,viewport}));return r;
    }
    await inside();
    // Body effects used by host themes must not establish the overlay's containing block.
    await page.evaluate(()=>{document.body.style.cssText='transform:translateY(300px);filter:brightness(.9);height:3000px;overflow:hidden';});
    await inside();assert.equal(await page.locator('#jmzq-garden').evaluate(e=>e.parentElement.tagName),'HTML');
    await page.evaluate(()=>{document.body.style.cssText='';});
    const cdp=await context.newCDPSession(page),b=await box();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:45,y:130}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);const moved=await inside();assert.ok(moved.y<b.y-100);assert.equal(await page.locator('.panel').isVisible(),false);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('jmzq_farm_floating_v1_preview')));assert.ok(stored);
    await page.reload();await page.locator('[data-ui="close"]').tap();const restored=await inside();assert.ok(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2);
    await page.locator('.bubble').tap();assert.equal(await page.locator('.panel').isVisible(),true);await page.locator('[data-ui="close"]').tap();
    // Simulate address-bar/keyboard/pinch viewport resize + pan, independent of layout viewport.
    await page.evaluate(()=>{
      const original=window.visualViewport;
      const v=new EventTarget();Object.assign(v,{width:280,height:360,offsetLeft:32,offsetTop:110});
      document.querySelector('#jmzq-garden').shadowRoot.querySelector('.viewport-safe').style.padding='20px 24px 24px 24px';
      Object.defineProperty(window,'visualViewport',{value:v,configurable:true});original.dispatchEvent(new Event('resize'));original.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(60);await inside('.bubble',{x:32,y:110,width:280,height:360});
    await page.locator('.bubble').tap();await inside('.panel',{x:32,y:110,width:280,height:360});
    await page.locator('[data-ui="close"]').tap();
    await page.evaluate(()=>{const e=new Event('pagehide');Object.defineProperty(e,'persisted',{value:true});window.dispatchEvent(e);window.dispatchEvent(new Event('pageshow'));});
    await inside('.bubble',{x:32,y:110,width:280,height:360});
    await page.evaluate(()=>{delete window.visualViewport;document.querySelector('#jmzq-garden').shadowRoot.querySelector('.viewport-safe').style.padding='';});await page.setViewportSize({width:844,height:390});await page.waitForTimeout(60);
    await inside('.bubble',{x:0,y:0,width:844,height:390});
    // Mouse drag and desktop panel header drag, without changing content or toolbar clicks.
    await page.setViewportSize({width:1500,height:1100});await page.waitForTimeout(60);
    const mouse=await box();await page.mouse.move(mouse.x+20,mouse.y+20);await page.mouse.down();await page.mouse.move(1460,1060,{steps:5});await page.mouse.up();
    await inside('.bubble',{x:0,y:0,width:1500,height:1100});assert.equal(await page.locator('.panel').isVisible(),false);
    await page.locator('.bubble').click();const before=await page.locator('.panel').boundingBox();
    const h=await page.locator('header .brand').boundingBox();await page.mouse.move(h.x+30,h.y+15);await page.mouse.down();await page.mouse.move(h.x+110,h.y+75,{steps:5});await page.mouse.up();
    const after=await inside('.panel',{x:0,y:0,width:1500,height:1100});assert.ok(after.x>before.x+30&&after.y>before.y+30);
    await page.locator('[data-ui="close"]').click();await inside('.bubble',{x:0,y:0,width:1500,height:1100});
    fs.mkdirSync(path.resolve(__dirname,'../tests/.artifacts'),{recursive:true});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(60);
    await page.screenshot({path:path.resolve(__dirname,'../tests/.artifacts/floating-mobile.png')});
    // Production script in a hidden nested runner must mount on the accessible Tavern document.
    const nested=await context.newPage();await nested.goto(url);await nested.evaluate(()=>window._farmCleanup());
    await nested.evaluate(()=>{const outer=document.createElement('iframe');outer.id='runner-outer';outer.style.display='none';document.body.append(outer);const inner=outer.contentDocument.createElement('iframe');inner.id='runner-inner';outer.contentDocument.body.append(inner);});
    const child=nested.frames().find(f=>f.parentFrame()&&f.parentFrame()!==nested.mainFrame());assert.ok(child);
    await child.evaluate(source=>(0,eval)(source),fs.readFileSync(path.resolve(__dirname,'../farm.js'),'utf8'));
    await nested.locator('.bubble').waitFor();assert.equal(await nested.locator('#jmzq-garden').evaluate(e=>e.parentElement.tagName),'HTML');
    await nested.locator('.bubble').tap();await nested.locator('.panel').waitFor();
    assert.deepEqual(errors,[]);console.log('Floating UI: touch/mouse drag, click suppression, reload, keyboard viewport, rotation, body effects, BFCache, header drag and nested runner passed');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
