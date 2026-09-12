// Isolated desktop zoom / scaled interactions; same browser env vars as check-floating.cjs.
const {chromium}=require(process.env.FARM_PLAYWRIGHT_DEPS||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.FARM_CHROMIUM_PATH||undefined});
  try{
    const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.FARM_PREVIEW_URL||'http://127.0.0.1:8765/JMZQFarm/preview/scene.html');
    const percent=page.locator('[data-ui="zoom-reset"]'),panel=page.locator('.panel');
    await percent.waitFor();
    async function validBounds(){
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const r=await panel.boundingBox(),v=page.viewportSize();
      assert.ok(r.x>=7&&r.y>=7&&r.x+r.width<=v.width-7&&r.y+r.height<=v.height-7,JSON.stringify({r,v}));return r;
    }
    assert.equal(await percent.textContent(),'85%');let r=await validBounds();
    assert.ok(Math.abs(r.width-1180*.85)<1&&Math.abs(r.height-850*.85)<1);
    // Every step is applied without rebuilding the active game view.
    await page.locator('nav [data-tab="farm"]').click();
    const sentinel=await page.locator('main').evaluate(e=>{e.dataset.zoomSentinel='keep';return e.dataset.page;});
    for(let i=0;i<3;i++)await page.locator('[data-ui="zoom-out"]').click();
    assert.equal(await percent.textContent(),'70%');assert.equal(await page.locator('[data-ui="zoom-out"]').isDisabled(),true);
    r=await validBounds();assert.ok(Math.abs(r.width-826)<1);
    assert.equal(await page.locator('main').getAttribute('data-zoom-sentinel'),'keep');
    assert.equal(await page.locator('main').getAttribute('data-page'),sentinel);
    // Drag distances are screen pixels even while the panel itself is scaled.
    const h=await page.locator('header .brand').boundingBox(),before=await panel.boundingBox();
    await page.mouse.move(h.x+30,h.y+12);await page.mouse.down();await page.mouse.move(h.x+110,h.y+72,{steps:6});await page.mouse.up();
    r=await validBounds();assert.ok(Math.abs(r.x-before.x-80)<2&&Math.abs(r.y-before.y-60)<2);
    await page.reload();await percent.waitFor();assert.equal(await percent.textContent(),'70%');await validBounds();
    await percent.click();assert.equal(await percent.textContent(),'100%');
    for(let i=0;i<2;i++)await page.locator('[data-ui="zoom-in"]').click();
    assert.equal(await percent.textContent(),'110%');assert.equal(await page.locator('[data-ui="zoom-in"]').isDisabled(),true);
    r=await validBounds();assert.ok(Math.abs(r.width-1298)<1);
    // A smaller desktop viewport clamps the enlarged panel, all controls stay reachable.
    await page.setViewportSize({width:800,height:600});await validBounds();
    await page.locator('nav [data-tab="bag"]').click();await page.locator('[data-do="pack"]').click();
    const modal=page.locator('dialog');await modal.waitFor();
    const dr=await modal.boundingBox();assert.ok(dr.x>=0&&dr.y>=0&&dr.x+dr.width<=801&&dr.y+dr.height<=601);
    await page.locator('[data-modal="cancel"]').click();assert.equal(await modal.isVisible(),false);
    // Scaled navigation: wheel, drag, last-tab reveal and tab clicks still work.
    await percent.click();for(let i=0;i<6;i++)await page.locator('[data-ui="zoom-out"]').click();
    const nav=page.locator('nav');await nav.evaluate(e=>{e.scrollLeft=0;});
    let n=await nav.boundingBox();await page.mouse.move(n.x+n.width*.8,n.y+n.height/2);await page.mouse.down();
    await page.mouse.move(n.x+n.width*.8-14,n.y+n.height/2,{steps:5});await page.mouse.up();
    const left=await nav.evaluate(e=>e.scrollLeft);assert.ok(Math.abs(left-14/.7)<3,'scaled navigation drag '+left);
    await page.waitForTimeout(400);await page.locator('nav [data-tab="bag"]').click();
    const active=await page.locator('nav .active').boundingBox();n=await nav.boundingBox();
    assert.ok(active.x>=n.x-1&&active.x+active.width<=n.x+n.width+1);
    // Desktop zoom does not shrink phone UI or overwrite its saved desktop value.
    await page.setViewportSize({width:390,height:844});await validBounds();assert.equal(await percent.isVisible(),false);
    assert.equal(await panel.evaluate(e=>getComputedStyle(e).transform),'matrix(1, 0, 0, 1, 0, 0)');
    await page.setViewportSize({width:1500,height:1100});await validBounds();assert.equal(await percent.textContent(),'70%');
    await percent.click();for(let i=0;i<3;i++)await page.locator('[data-ui="zoom-out"]').click();
    fs.mkdirSync(path.resolve(__dirname,'../tests/.artifacts'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../tests/.artifacts/desktop-zoom-85.png')});
    assert.deepEqual(errors,[]);
    console.log('Scaling: 85% default, 70–110 bounds, reset/reload, scaled drag/navigation, dialog, mobile isolation and viewport clamp passed');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
