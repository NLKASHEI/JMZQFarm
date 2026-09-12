'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../farm.js');
const now = new Date(2026,8,12,12).getTime();
function state(items={}) {
  return C.migrate({fish:{money:2000},meta:{level:10,adventure:{materials:items}}},now);
}
const target={scope:'角色:聊天',messageId:4,swipe:0,textHash:42,label:'测试角色'};

test('32项成就都有唯一分类、可达目标、有效奖励；每项只发放一次',()=>{
  assert.equal(C.MILESTONES.length,32);
  assert.equal(new Set(C.MILESTONES.map(g=>g.id)).size,32);
  const ids=C.ACHIEVEMENT_CATEGORIES.flatMap(c=>c.goals);assert.equal(ids.length,32);assert.equal(new Set(ids).size,32);
  for(const goal of C.MILESTONES){
    assert.ok(ids.includes(goal.id));assert.ok(goal.coins>0&&Number.isInteger(goal.coins));assert.ok(goal.target>0);
    for(const [name,count] of Object.entries(goal.items)){assert.ok(C.ITEMS[name],name);assert.ok(Number.isInteger(count)&&count>0);}
    const s=C.makeState(now);C.tick(s,now);
    assert.equal(C.milestoneStatus(s,goal).ready,false,goal.id+' fresh');
    assert.throws(()=>C.action(s,'milestone',{id:goal.id},now),/暂不能领取/);
    Object.assign(s.stats,{harvest:500,ranch:300,fish:100,explore:60,craft:150});s.level=15;
    [...C.CROPS,...C.FISH].forEach(x=>s.collection[x.name]=1);
    s.discoveries=Array.from({length:12},(_,i)=>'place'+i);s.projects=C.PROJECTS.map(p=>p.id);s.idle.built=true;
    s.fishBook.perfect=10;s.fishBook.chests=3;s.fishBook.heaviest={name:'鲟鱼',weight:4};
    assert.equal(C.milestoneStatus(s,goal).ready,true,goal.id+' target');
    const before=C.clone(s),counts=Object.fromEntries(Object.keys(goal.items).map(n=>[n,C.available(s,n)]));
    C.action(s,'milestone',{id:goal.id},now);
    assert.equal(s.coins,before.coins+goal.coins,goal.id);
    for(const [name,count] of Object.entries(goal.items))assert.equal(C.available(s,name),counts[name]+count);
    assert.deepEqual(s.stats,before.stats);assert.deepEqual(s.deliveries,[]);assert.equal(s.pending,null);
    const saved=C.clone(s);assert.throws(()=>C.action(s,'milestone',{id:goal.id},now),/暂不能领取/);assert.deepEqual(s,saved);
    const reloaded=C.clone(s);C.tick(reloaded,now);assert.equal(C.milestoneStatus(reloaded,goal).ready,false);
  }
});

test('成就精确阈值、鱼类记录对象、复合条件和旧领奖兼容',()=>{
  const s=state(),heavy=C.MILESTONES.find(g=>g.id==='heavy_fish'),all=C.MILESTONES.find(g=>g.id==='all_rounder');
  s.fishBook.heaviest={name:'鲟鱼',weight:3.99};assert.equal(C.milestoneStatus(s,heavy).ready,false);
  s.fishBook.heaviest.weight=4;assert.equal(C.milestoneStatus(s,heavy).ready,true);
  Object.assign(s.stats,{harvest:30,ranch:30,fish:29});assert.equal(C.milestoneStatus(s,all).ready,false);
  s.stats.fish=30;s.level=7;assert.equal(C.milestoneStatus(s,all).ready,false);
  s.level=8;assert.equal(C.milestoneStatus(s,all).ready,true);
  const legacy=C.migrate({meta:{achievements:['fish_25','unknown_old_id']}},now);legacy.stats.fish=100;
  assert.equal(C.MILESTONES.filter(g=>C.milestoneStatus(legacy,g).claimed).length,1);
  assert.throws(()=>C.action(legacy,'milestone',{id:'fish_25'},now),/暂不能领取/);
  assert.ok(legacy.claimedMilestones.includes('unknown_old_id'));
});
test('轮作、浇水与照料均生效，收获不能重复领取',()=>{
  const s=state(); s.plots[0].lastFamily='叶菜';
  C.action(s,'plant',{index:0,name:'土豆'},now,()=>1);
  assert.equal(s.plots[0].rotation,true);
  if(!s.plots[0].watered) C.action(s,'care',{index:0},now+100);
  C.action(s,'care',{index:0},now+200);
  const end=s.plots[0].readyAt;
  assert.throws(()=>C.action(s,'harvest',{index:0},now+300),/成熟/);
  C.action(s,'harvest',{index:0},end);
  assert.equal(C.available(s,'土豆'),5);
  assert.equal(s.bag[0].quality,'精良');
  assert.throws(()=>C.action(s,'harvest',{index:0},end),/成熟/);
});
test('整套配方验证失败不扣材料，指定鱼和任意鱼不复用',()=>{
  const s=state({'土豆':2,'鲫鱼':1}); const before=C.clone(s.bag);
  assert.throws(()=>C.consume(s,{'土豆':2,'净水':1}),/材料不足/);
  assert.deepEqual(s.bag,before);
  assert.throws(()=>C.consume(s,{'任意鱼':1,'鲫鱼':1}),/材料不足/);
  assert.deepEqual(s.bag,before);
});
test('河豚不进入普通鱼肉配方',()=>{
  const s=state({'河豚':2});assert.equal(C.available(s,'任意鱼'),0);
  assert.throws(()=>C.consume(s,{'任意鱼':1}),/材料不足/);
});
test('牧场饲养加速与产出单次领取',()=>{
  const s=state();s.upgrades.barn=5;
  C.action(s,'buy-animal',{name:'鸡',index:0},now);
  assert.equal(s.pens[0].readyAt-now,4*60000*.75);
  C.action(s,'feed',{index:0},now);
  C.action(s,'collect',{index:0},s.pens[0].readyAt);
  assert.equal(C.available(s,'鸡蛋'),2);
  assert.throws(()=>C.action(s,'collect',{index:0},now),/准备好/);
});
test('探索结果出发时固定，跨刷新不重抽，领取一次',()=>{
  const s=state();C.action(s,'explore',{zone:'woodland',stance:'bold'},now,()=>.5);
  const copied=C.clone(s); assert.equal(copied.expedition.success,true);
  C.action(copied,'explore-choice',{choice:'safe'},copied.expedition.encounter.at);
  C.action(copied,'claim-explore',{},copied.expedition.readyAt,()=>{throw Error('不该重抽');});
  assert.equal(copied.bag.reduce((a,b)=>a+b.count,0),5);
  assert.throws(()=>C.action(copied,'claim-explore',{},now+1e6),/尚未结束/);
});
test('制作统一扣材料，完成单次领取',()=>{
  const s=state({'白菜':4});C.action(s,'craft',{name:'蔬菜干'},now);
  assert.equal(C.available(s,'白菜'),2);const job=C.clone(s.workshop[0]);
  assert.throws(()=>C.action(s,'claim-craft',{id:job.id},now),/尚未完成/);
  C.action(s,'claim-craft',{id:job.id},job.readyAt);
  assert.equal(C.available(s,'蔬菜干'),1);
  assert.throws(()=>C.action(s,'claim-craft',{id:job.id},job.readyAt),/尚未完成/);
});
test('星露谷式钓鱼使用追鱼过程结算，重复领取被拒绝',()=>{
  const s=state();C.action(s,'cast',{owner:'test'},now,()=>0);
  const f=s.fishing;C.action(s,'hook',{owner:'test'},f.biteAt);
  for(let i=0;i<5400&&!f.engine.result;i++)C.stepFish(f.engine,f.engine.bar+f.engine.velocity*.2>f.engine.fish,1/60);
  assert.equal(f.engine.result,'won');
  C.action(s,'land-fish',{id:f.id,owner:'test'},f.biteAt+10000);
  assert.equal(C.available(s,'任意鱼'),1);assert.ok(s.fishBook.heaviest);
  assert.throws(()=>C.action(s,'land-fish',{id:f.id,owner:'test'},now+60000),/已变化/);
});
test('提前提竿、超时提竿和未完成搏鱼不能直接得奖',()=>{
  const s=state();C.action(s,'cast',{},now,()=>0);
  assert.throws(()=>C.action(s,'hook',{owner:'local'},now),/咬钩/);assert.ok(s.fishing);
  assert.throws(()=>C.action(s,'hook',{owner:'local'},now+100000),/错过/);
  assert.throws(()=>C.action(s,'land-fish',{id:s.fishing.id,owner:'local'},now),/没有结束/);
  C.action(s,'cancel-fish',{},now+100000);assert.equal(s.bag.length,0);assert.equal(s.fishing,null);
});
test('每日奖励防重复与系统时间回退防刷新',()=>{
  const s=state();s.daily[0].progress=6;
  C.action(s,'daily',{id:'harvest'},now);const amount=s.coins;
  assert.throws(()=>C.action(s,'daily',{id:'harvest'},now),/不能领取/);
  C.tick(s,now-86400000);assert.equal(s.daily[0].claimed,true);assert.equal(s.coins,amount);
});
test('旧存档迁移保留核心财产和图鉴，退休设施退币，原对象不修改',()=>{
  const legacy={fish:{money:77,currentRod:'carbon',inventory:[{name:'鲫鱼',weight:1.8,rarity:'稀有'},{name:'破靴子'}]},
    farm:{plots:[{crop:'土豆',plantedAt:now-600000}],upgrades:{yieldBonus:2}},
    ranch:{pens:[{animal:'鸡',placedAt:now-600000}],tempBag:[{name:'白菜',count:7}]},
    meta:{level:7,xp:45,mastery:{products:{'鲫鱼':19}},adventure:{materials:{'木材':3}},workshop:{crafted:{radio:1},buffs:{fish:6}}}};
  const before=C.clone(legacy),s=C.migrate(legacy,now);
  assert.deepEqual(legacy,before);assert.equal(s.coins,247);assert.equal(s.upgrades.rod,2);
  assert.equal(s.collection['鲫鱼'],19);assert.equal(C.available(s,'白菜'),7);
  assert.equal(C.available(s,'便携收音机'),1);assert.equal(s.buffs.fish,6);
  assert.equal(s.pens[0].name,'鸡');assert.ok(s.plots[0].readyAt<now);
  assert.equal(s.bag.find(x=>x.name==='破靴子').legacy,true);
  assert.equal(s.bag.find(x=>x.name==='鲫鱼').weight,1.8);
});
test('装箱先预留、失败回退不增加图鉴，恢复后仍可使用原堆叠',()=>{
  const s=state({'土豆':5});const row=s.bag[0];
  const pending=C.reserve(s,row.id,5,target,now);
  assert.equal(C.available(s,'土豆'),0);assert.equal(s.collection['土豆'],5);
  assert.throws(()=>C.reserve(s,row.id,1,target),/等待核对/);
  C.restoreTransfer(s,pending.id);
  assert.equal(s.bag[0].id,row.id);assert.equal(C.available(s,'土豆'),5);assert.equal(s.collection['土豆'],5);
});
test('收据与背包同次写入；重试相同ID无重复；其它变量不变',()=>{
  const s=state({'土豆':5}),pending=C.reserve(s,s.bag[0].id,2,target,now);
  const before={stat_data:{物品:{},核心状态:{hp_current:52}},schema:{keep:true},other:'unchanged'};
  const a=C.mergeReward(before,pending),b=C.mergeReward(a.variables,pending);
  assert.equal(a.variables.stat_data.物品.土豆.count,2);assert.equal(b.duplicate,true);
  assert.equal(b.variables.stat_data.物品.土豆.count,2);assert.deepEqual(before.stat_data.物品,{});
  assert.deepEqual(a.variables.stat_data.核心状态,before.stat_data.核心状态);
  assert.deepEqual(a.variables.schema,before.schema);assert.equal(a.variables.other,before.other);
  C.finishTransfer(s,pending.id);assert.equal(s.pending,null);assert.equal(s.deliveries.length,1);
  assert.throws(()=>C.finishTransfer(s,pending.id),/已变化/);
});
test('同质堆叠只加count，异质或额外属性分开存放',()=>{
  const s=state({'土豆':5}),pending=C.reserve(s,s.bag[0].id,2,target,now);
  const base=C.clone(pending.item);base.count=4;
  const first=C.mergeReward({stat_data:{物品:{土豆:base}}},pending);
  assert.equal(first.name,'土豆');assert.equal(first.variables.stat_data.物品.土豆.count,6);
  for(const change of [{quality:'稀有'},{condition:50},{weight:5},{detail:'别的描述'},{特殊效果:'加血'}]) {
    const old={...base,...change};const result=C.mergeReward({stat_data:{物品:{土豆:old}}},pending);
    assert.equal(result.name,'土豆·小院');assert.deepEqual(result.variables.stat_data.物品.土豆,old);
  }
});
test('非法数量、原型键、经营增益不能进入背包',()=>{
  const s=state({'土豆':3,'温室营养液':1});const row=s.bag.find(x=>x.name==='土豆');
  for(const amount of [0,-1,1.5,4,NaN,Infinity]) assert.throws(()=>C.reserve(s,row.id,amount,target),/数量无效/);
  assert.throws(()=>C.itemPayload(s.bag.find(x=>x.name==='温室营养液'),1),/小院内/);
  assert.throws(()=>C.itemPayload({name:'__proto__',count:1},1));
  assert.equal(C.available(s,'土豆'),3);
});
test('当前角色卡真实ZOD校验全部实体物品以及合并后的背包',{skip:!process.env.FARM_ZOD_FILE},()=>{
  // Optional integration check against an existing character card; no card files are bundled.
  const deps=process.env.FARM_TEST_DEPS || path.resolve(__dirname,'../node_modules');
  const z=require(path.join(deps,'zod')),lodash=require(path.join(deps,'lodash'));
  const code=fs.readFileSync(process.env.FARM_ZOD_FILE,'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('export const Schema','const Schema');
  const context={z,_:lodash,$:()=>{},console};
  vm.runInNewContext(code+'\nthis.itemSchema=ItemSchema;this.inventorySchema=InventorySchema;',context);
  const all={};
  for(const cfg of Object.values(C.ITEMS).filter(x=>x.transferable)) {
    const payload=C.itemPayload({name:cfg.name,quality:'精良',weight:cfg.weight,count:3},2);
    assert.equal(context.itemSchema.safeParse(payload).success,true,cfg.name);
    all[cfg.name]=payload;
  }
  const parsed=context.inventorySchema.parse(all);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)),{...all,载具配件:{}});
});
test('按住上浮，松开下沉，单帧步长上限避免切回窗口瞬间脱钩',()=>{
  const fish=C.FISH[0],up=C.makeFishEngine(fish,25,12,false),down=C.clone(up);
  for(let i=0;i<30;i++){C.stepFish(up,true,1/60);C.stepFish(down,false,1/60);}
  assert.ok(up.bar<50);assert.ok(down.bar>50);
  const elapsed=up.elapsed;C.stepFish(up,true,900);assert.ok(up.elapsed-elapsed<=.051);
});
test('正在另一窗口搏鱼时不允许立即抢占；暂停后可接续',()=>{
  const s=state();C.action(s,'cast',{owner:'one'},now,()=>0);
  assert.throws(()=>C.action(s,'resume-fish',{owner:'two'},now+3500),/另一个窗口/);
  C.action(s,'resume-fish',{owner:'two'},now+5000);assert.equal(s.fishing.owner,'two');
  assert.throws(()=>C.action(s,'land-fish',{id:s.fishing.id,owner:'one'},now+6000),/已变化/);
});
test('钓具永久购买，切换不重复扣钱；海鱼不会出现在河岸',()=>{
  const s=state();C.action(s,'tackle',{kind:'rod',key:'carbon'},now);const paid=s.coins;
  C.action(s,'tackle',{kind:'rod',key:'bamboo'},now);C.action(s,'tackle',{kind:'rod',key:'carbon'},now);
  assert.equal(s.coins,paid);
  for(let i=0;i<25;i++){
    s.energy=10;C.action(s,'cast',{owner:'test'},now,()=>i/25);
    assert.ok(C.SPOTS[0].fish.includes(s.fishing.name));C.action(s,'cancel-fish',{},now);
  }
});
test('探索遭遇消耗工具获得额外回报，选项不可重复刷材料',()=>{
  const s=state({'废铁':2});C.action(s,'explore',{zone:'woodland',stance:'balanced'},now,()=>0);
  const t=s.expedition;assert.equal(t.encounter.index,0);
  assert.throws(()=>C.action(s,'claim-explore',{},t.readyAt),/先决定/);
  C.action(s,'explore-choice',{choice:'tool'},t.encounter.at);
  assert.equal(C.available(s,'废铁'),1);assert.equal(s.discoveries.length,1);
  const rewards=C.clone(t.rewards);
  assert.throws(()=>C.action(s,'explore-choice',{choice:'tool'},t.readyAt),/待选择/);
  assert.deepEqual(t.rewards,rewards);assert.equal(C.available(s,'废铁'),1);
});
test('心得点、成就、项目均按进度领取，不重复发奖励',()=>{
  const s=state({'木材':6,'布料':3,'废铁':2});
  assert.equal(C.talentPoints(s),3);C.action(s,'talent',{key:'fish'},now);assert.equal(C.talentPoints(s),2);
  s.stats.harvest=1;C.action(s,'milestone',{id:'first_harvest'},now);assert.equal(C.available(s,'净水'),1);
  assert.throws(()=>C.action(s,'milestone',{id:'first_harvest'},now),/暂不能领取/);
  assert.throws(()=>C.action(s,'project',{id:'signal'},now),/已变化/);
  C.action(s,'project',{id:'shed'},now);assert.equal(C.available(s,'雨布挎包'),1);
  assert.throws(()=>C.action(s,'project',{id:'shed'},now),/已变化/);
});
test('旧版鱼饵、钓点、最大纪录、成就、探索发现一并保留',()=>{
  const old={fish:{currentBait:'magic',currentSpot:'ruins',records:{heaviest:{name:'鲟鱼',weight:4.8},longest:{name:'鲟鱼',length:55}}},
    meta:{level:10,achievements:['fish_25'],adventure:{discoveries:['旧药房']}}};
  const s=C.migrate(old,now);assert.equal(s.tackle.bait,'magic');assert.equal(s.tackle.spot,'ruins');
  assert.equal(s.fishBook.heaviest.weight,4.8);assert.deepEqual(s.claimedMilestones,['fish_25']);assert.deepEqual(s.discoveries,['旧药房']);
});
test('值守补种和喂食遵守每天预算，代收不自动装入剧情背包',()=>{
  const s=state();C.action(s,'plant',{name:'土豆',index:0},now,()=>1);C.action(s,'buy-animal',{name:'鸡',index:0},now);
  Object.assign(s.idle,{built:true,enabled:true,lastAt:now,budget:30,autoPlant:true,autoFeed:true});
  const report=C.settleIdle(s,now+30*60000);
  assert.ok(report.harvest>=3);assert.ok(report.ranch>0);assert.ok(report.spent<=30);
  assert.equal(s.pending,null);assert.deepEqual(s.deliveries,[]);
  const saved=C.clone(s);assert.equal(C.settleIdle(s,now+30*60000),null);assert.deepEqual(s,saved);
});
test('挂机最多8小时，重复打开和时钟回退不补发',()=>{
  const s=state();C.action(s,'buy-animal',{name:'鸡',index:0},now);
  Object.assign(s.idle,{built:true,enabled:true,lastAt:now});
  const r=C.settleIdle(s,now+24*60*60000);assert.equal(r.minutes,480);assert.equal(r.capped,true);
  const count=C.available(s,'鸡蛋');assert.ok(count<=121);
  assert.equal(C.settleIdle(s,now+24*60*60000),null);assert.equal(C.settleIdle(s,now),null);
  assert.equal(C.available(s,'鸡蛋'),count);
});
test('未开启值守不自动处理库存，自动售卖保留份额且不出售稀有鱼与装备',()=>{
  const s=state({'白菜':30,'雨布挎包':20});s.bag.push({id:'rare',name:'鲟鱼',quality:'稀有',weight:3,count:12});
  s.idle.lastAt=now;assert.equal(C.settleIdle(s,now+60000),null);assert.equal(C.available(s,'白菜'),30);
  Object.assign(s.idle,{built:true,enabled:true,sellSurplus:true,keep:10,lastAt:now});
  C.settleIdle(s,now+60000);assert.equal(C.available(s,'白菜'),10);assert.equal(C.available(s,'雨布挎包'),20);assert.equal(C.available(s,'鲟鱼'),12);
});
