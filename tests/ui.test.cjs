'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const deps=process.env.FARM_TEST_DEPS||path.resolve(__dirname,'../node_modules');
const {JSDOM,VirtualConsole}=require(path.join(deps,'jsdom'));
const {IDBFactory}=require(path.join(deps,'fake-indexeddb'));
const C=require('../farm.js'),source=fs.readFileSync(path.resolve(__dirname,'../farm.js'),'utf8');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(10);}throw Error('流程未在预期时间内完成');}
async function setup(t){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://farm-test.local/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,factory=new IDBFactory();w.indexedDB=factory;w.__GARDEN_PREVIEW__=true;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  let vars={stat_data:{物品:{旧物:{emoji:'📦',count:1,quality:'普通',weight:1,condition:90,category:'工具零件',detail:'保持原样'}},核心状态:{hp_current:50}},other:'keep'},mode='ok',chatId='测试聊天',mvu=false;
  const context={chat:[{mes:'模拟正文',swipe_id:0,is_user:false}],characterId:'test',name1:'测试角色',getCurrentChatId:()=>chatId,eventSource:{on(){},removeListener(){}}};
  w.SillyTavern={getContext:()=>context};w.Mvu={isDuringExtraAnalysis:()=>mvu};
  w.TavernHelper={getVariables:()=>structuredClone(vars),updateVariablesWith(fn){if(mode==='fail')throw Error('模拟接口拒绝');vars=fn(structuredClone(vars));if(mode==='after')throw Error('已写入但返回错误');return structuredClone(vars);}};
  w.eval(source);
  await until(()=>w.document.querySelector('#jmzq-garden')?.shadowRoot.querySelector('[data-do="demo-supplies"]'));
  const root=w.document.querySelector('#jmzq-garden').shadowRoot;
  async function read(){return new Promise((resolve,reject)=>{const req=factory.open('ZodFarmDB',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('state','readonly').objectStore('state').get(C.KEY+'_preview');r.onsuccess=()=>{resolve(r.result.value);db.close();};r.onerror=()=>reject(r.error);};req.onerror=()=>reject(req.error);});}
  const click=selector=>{const el=root.querySelector(selector);assert.ok(el,selector);assert.equal(el.disabled,false,selector+' 不该禁用');el.click();};
  t.after(()=>{w._farmCleanup?.();w.close();assert.deepEqual(errors,[]);});
  return {root,click,read,variables:()=>vars,mode:v=>mode=v,chat:v=>chatId=v,mvu:v=>mvu=v,w};
}
test('完整装箱流程：取消不扣库存，确认仅转一次，旧变量不变',async t=>{
  const env=await setup(t);env.click('[data-tab="bag"]');const before=await env.read(),count=before.bag[0].count;
  env.click('[data-do="pack"]');await until(()=>env.root.querySelector('dialog').open);
  env.click('[data-modal="cancel"]');assert.equal((await env.read()).bag[0].count,count);
  env.click('[data-do="pack"]');await until(()=>env.root.querySelector('dialog').open);env.click('[data-modal="confirm"]');
  await until(async()=>Object.keys(env.variables()[C.RECEIPTS]||{}).length===1 && !(await env.read()).pending);
  assert.equal((await env.read()).bag[0].count,count-1);assert.equal(env.variables().stat_data.物品.木材.count,1);
  assert.equal(env.variables().stat_data.物品.旧物.count,1);assert.equal(env.variables().stat_data.核心状态.hp_current,50);assert.equal(env.variables().other,'keep');
});
test('接口写入前拒绝：库存退回，错误在弹窗内可见',async t=>{
  const env=await setup(t);env.mode('fail');env.click('[data-tab="bag"]');const before=await env.read();
  env.click('[data-do="pack"]');await until(()=>env.root.querySelector('dialog').open);env.click('[data-modal="confirm"]');
  await until(()=>env.root.querySelector('.dialog-error').textContent.includes('模拟接口拒绝'));
  const after=await env.read();assert.deepEqual(after.bag,before.bag);assert.equal(after.pending,null);assert.equal(env.variables().stat_data.物品.木材,undefined);
});
test('背包已写入但接口返回错误：收据核对后成功完成，不重复发奖',async t=>{
  const env=await setup(t);env.mode('after');env.click('[data-tab="bag"]');const before=await env.read();
  env.click('[data-do="pack"]');await until(()=>env.root.querySelector('dialog').open);env.click('[data-modal="confirm"]');
  await until(async()=>env.variables().stat_data.物品.木材?.count===1 && (await env.read()).deliveries.length===1);
  const after=await env.read();assert.equal(after.bag[0].count,before.bag[0].count-1);assert.equal(after.pending,null);
  assert.match(env.root.querySelector('.toast').textContent,/已核对/);
});
test('MVU解析时拒绝装箱，确认前切换聊天也不写入',async t=>{
  const env=await setup(t);env.click('[data-tab="bag"]');const before=await env.read();
  env.mvu(true);env.click('[data-do="pack"]');await until(()=>env.root.querySelector('.toast').textContent.includes('额外模型'));
  assert.equal(env.root.querySelector('dialog').open,false);env.mvu(false);
  env.click('[data-do="pack"]');await until(()=>env.root.querySelector('dialog').open);env.chat('另一个聊天');env.click('[data-modal="confirm"]');
  await until(()=>env.root.querySelector('.dialog-error').textContent.includes('已变化'));
  assert.deepEqual((await env.read()).bag,before.bag);assert.equal(env.variables().stat_data.物品.木材,undefined);
});
test('所有功能页可渲染，值守设置保存前不生效',async t=>{
  const env=await setup(t);
  for(const page of ['farm','ranch','fish','explore','workshop','journal','achievements','idle','bag']){env.click('[data-tab="'+page+'"]');assert.ok(env.root.querySelector('main').textContent.length>50);}
  env.click('[data-tab="overview"]');env.click('[data-do="demo-supplies"]');await until(async()=>(await env.read()).level===10);
  env.click('[data-tab="idle"]');env.click('[data-do="build-idle"]');await until(()=>env.root.querySelector('[data-idle="enabled"]'));
  env.root.querySelector('[data-idle="enabled"]').checked=true;
  assert.equal((await env.read()).idle.enabled,false);env.click('[data-do="save-idle"]');await until(async()=>(await env.read()).idle.enabled);
  assert.equal((await env.read()).idle.sellSurplus,false);
});
test('成就筛选分页与选中同步，领奖仅入小院；领取后空页不崩溃',async t=>{
  const env=await setup(t);env.click('[data-tab="achievements"]');
  assert.equal(env.root.querySelectorAll('.achievement-card').length,6);
  env.click('[data-do="achievement-page"][data-index="1"]');
  assert.equal(env.root.querySelector('.achievement-pagination span').textContent,'2 / 6 页');
  const second=env.root.querySelectorAll('.achievement-card')[1];env.click('[data-do="select-achievement"][data-id="'+second.dataset.id+'"]');
  assert.equal(env.root.querySelector('.achievement-detail').dataset.achievement,second.dataset.id);
  env.click('[data-ui="theme"]');await until(()=>env.root.querySelector('.garden.light'));
  assert.equal(env.root.querySelector('.achievement-detail').dataset.achievement,second.dataset.id);
  env.click('[data-do="achievement-filter"][data-id="fish"]');
  assert.equal(env.root.querySelector('.achievement-pagination span').textContent,'1 / 2 页');
  env.click('[data-do="achievement-filter"][data-id="ready"]');assert.equal(env.root.querySelectorAll('.achievement-card').length,0);
  env.click('[data-tab="overview"]');env.click('[data-do="demo-supplies"]');await until(async()=>(await env.read()).level===10);
  env.click('[data-tab="achievements"]');assert.equal(env.root.querySelector('[data-do="milestone"]').dataset.id,'collector');
  const before=await env.read(),vars=structuredClone(env.variables());env.click('[data-do="milestone"]');
  await until(async()=>(await env.read()).claimedMilestones.includes('collector'));
  await until(()=>!env.root.querySelector('[data-do="milestone"]'));
  assert.equal((await env.read()).coins,before.coins+220);assert.deepEqual(env.variables(),vars);
  env.click('[data-do="achievement-filter"][data-id="home"]');env.click('[data-do="select-achievement"][data-id="collector"]');
  assert.equal(env.root.querySelector('[data-do="milestone"]').disabled,true);
});

test('每项成就卡片和详情使用同一专属图案，32项彼此不重样',async t=>{
  const env=await setup(t),seen=new Set();env.click('[data-tab="achievements"]');
  for(const category of C.ACHIEVEMENT_CATEGORIES){
    env.click('[data-do="achievement-filter"][data-id="'+category.id+'"]');
    for(let page=0;page<Math.ceil(category.goals.length/6);page++){
      if(page)env.click('[data-do="achievement-page"][data-index="'+page+'"]');
      const ids=[...env.root.querySelectorAll('.achievement-card')].map(b=>b.dataset.id);
      for(const id of ids){
        env.click('[data-do="select-achievement"][data-id="'+id+'"]');
        const art=C.ACHIEVEMENT_ART[id],nodes=env.root.querySelectorAll('.medal[data-art-goal="'+id+'"]');
        assert.equal(nodes.length,2);
        for(const node of nodes){assert.equal(node.querySelector('img').dataset.asset,art.sheet);assert.equal(node.style.getPropertyValue('--mx'),String(art.cell%4));assert.equal(node.style.getPropertyValue('--my'),String(Math.floor(art.cell/4)+(art.offsetY||0)));}
        seen.add(id);
      }
    }
  }
  assert.equal(seen.size,32);
});

test('长按与释放驱动追鱼，暂停不丢失进度且不继续下坠',async t=>{
  const env=await setup(t);env.click('[data-tab="fish"]');env.click('[data-do="cast"]');
  await until(async()=>!!(await env.read()).fishing);
  const future=Date.now()+10000;env.w.Date.now=()=>future;
  env.click('[data-tab="overview"]');env.click('[data-tab="fish"]');env.click('[data-do="hook"]');
  await until(()=>env.root.querySelector('[data-hold="fish"]'));
  const player=()=>parseFloat(env.root.querySelector('#fish-player').style.top);
  const hold=env.root.querySelector('[data-hold="fish"]'),initial=player();
  hold.dispatchEvent(new env.w.MouseEvent('pointerdown',{bubbles:true,composed:true,cancelable:true}));
  await delay(200);const raised=player();assert.ok(raised<initial,'按住后应上浮');
  hold.dispatchEvent(new env.w.MouseEvent('pointerup',{bubbles:true,composed:true}));
  await delay(500);assert.ok(player()>raised,'松开后应在惯性结束后下沉');
  env.click('[data-do="pause-fish"]');await until(()=>env.root.querySelector('[data-do="resume-fish"]'));
  const paused=player();await delay(100);assert.equal(player(),paused);
  assert.equal((await env.read()).fishing.phase,'fight');
});

test('选择土地与围栏只更新操作区，不误收获、不误购买，刷新保留选中项',async t=>{
  const env=await setup(t),before=await env.read();
  env.click('[data-tab="farm"]');env.click('[data-do="select-plot"][data-index="4"]');
  assert.equal(env.root.querySelector('[data-do="select-plot"][data-index="4"]').getAttribute('aria-pressed'),'true');
  assert.equal(env.root.querySelector('[data-do="seed"]').dataset.index,'4');
  env.click('[data-ui="theme"]');await until(()=>env.root.querySelector('.garden.light'));
  assert.equal(env.root.querySelector('[data-do="seed"]').dataset.index,'4');
  env.click('[data-tab="ranch"]');env.click('[data-do="select-pen"][data-index="2"]');
  assert.equal(env.root.querySelector('[data-do="adopt"]').dataset.index,'2');
  const after=await env.read();assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.pens,before.pens);assert.equal(after.coins,before.coins);
});

test('鼠标拖动导航不误触TAB，滚轮和箭头有效，数据刷新不回弹导航',async t=>{
  const env=await setup(t),nav=env.root.querySelector('nav');
  Object.defineProperty(nav,'scrollWidth',{value:1000});Object.defineProperty(nav,'clientWidth',{value:250});
  const pointer=(type,x)=>nav.dispatchEvent(new env.w.MouseEvent(type,{bubbles:true,clientX:x,button:0,cancelable:true}));
  pointer('pointerdown',200);pointer('pointermove',100);pointer('pointerup',100);
  assert.equal(nav.scrollLeft,100);
  env.root.querySelector('[data-tab="ranch"]').click();assert.equal(env.root.querySelector('main').dataset.page,'overview');
  env.click('[data-tab="ranch"]');assert.equal(env.root.querySelector('main').dataset.page,'ranch');
  nav.scrollLeft=340;env.click('[data-ui="theme"]');await until(()=>env.root.querySelector('.garden.light'));
  assert.equal(nav.scrollLeft,340);
  nav.dispatchEvent(new env.w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80}));assert.equal(nav.scrollLeft,420);
  env.click('[data-ui="nav-next"]');assert.equal(nav.scrollLeft,600);
});

test('配方和库存点选有唯一选中状态，动作只作用于选中条目',async t=>{
  const env=await setup(t);env.click('[data-tab="workshop"]');env.click('[data-do="select-recipe"][data-name="便携收音机"]');
  assert.equal(env.root.querySelectorAll('.recipe-option.selected').length,1);
  assert.equal(env.root.querySelector('[data-do="craft"]').dataset.name,'便携收音机');
  env.click('[data-tab="bag"]');const item=(await env.read()).bag[1];
  env.click('[data-do="select-stack"][data-id="'+item.id+'"]');
  assert.equal(env.root.querySelectorAll('.stock-tile.selected').length,1);
  assert.equal(env.root.querySelector('[data-do="pack"]').dataset.id,item.id);
});

test('使用校准后图集，鸡所在第三行不按旧256等分取样；图片失败有后备',async t=>{
  const env=await setup(t);env.click('[data-tab="ranch"]');env.click('[data-do="select-pen"][data-index="2"]');env.click('[data-do="adopt"]');
  await until(()=>env.root.querySelector('dialog').open);
  const chicken=env.root.querySelector('[data-modal="鸡"] .sprite');
  assert.equal(chicken.style.getPropertyValue('--sx'),'1');assert.equal(chicken.style.getPropertyValue('--sy'),String(488/256));
  const img=chicken.querySelector('img');assert.match(img.src,/sprites-v2\.webp$/);
  img.dispatchEvent(new env.w.Event('error'));assert.match(img.src,/testingcf\.jsdelivr/);
  img.dispatchEvent(new env.w.Event('error'));assert.match(img.src,/cdn\.jsdelivr/);
  img.dispatchEvent(new env.w.Event('error'));assert.match(img.src,/raw\.githubusercontent/);
  img.dispatchEvent(new env.w.Event('error'));assert.equal(img.hidden,true);assert.ok(chicken.classList.contains('asset-missing'));
});
