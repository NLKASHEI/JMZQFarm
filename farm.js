/* 缄默之秋 · 小农场 4.3.0
 * 单文件酒馆助手脚本。旧 IndexedDB 键只读迁移；正文与导演时序不参与小游戏结算。
 * 逻辑层可在 Node 中独立载入，界面使用 Shadow DOM 隔离宿主样式。
 */
(function () {
  'use strict';
  const VERSION = '4.3.0';
  const KEY = 'garden_v4';
  const RECEIPTS = 'jmzq_farm_receipts_v4';
  const MINUTE = 60000;
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));
  const number = (v, fallback = 0) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
  const int = (v, max = 1000000) => Math.min(max, Math.max(0, Math.floor(number(v))));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const safeName = name => typeof name === 'string' && name.length > 0 && name.length < 100 && !['__proto__', 'constructor', 'prototype', '载具配件'].includes(name);
  function requireThat(ok, message) { if (!ok) throw new Error(message); }
  function hash(text) {
    let n = 2166136261;
    for (const c of String(text)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
    return n >>> 0;
  }
  function dayKey(now = Date.now()) {
    const d = new Date(now);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const CROPS = [
    ['土豆','🥔',3,3,18,7,.3,'根茎',1], ['白菜','🥬',4,2,22,12,.5,'叶菜',1],
    ['胡萝卜','🥕',5,2,25,14,.2,'根茎',1], ['辣椒','🌶️',5,2,28,16,.1,'果菜',2],
    ['番茄','🍅',6,3,35,15,.2,'果菜',2], ['玉米','🌽',8,2,38,20,.4,'谷物',2],
    ['小麦','🌾',10,5,30,8,.1,'谷物',1], ['南瓜','🎃',12,1,45,50,2,'果菜',3],
    ['豆类','🫘',7,4,34,11,.08,'豆科',2], ['草莓','🍓',7,3,48,24,.12,'浆果',3],
    ['水稻','🍚',11,5,44,12,.1,'谷物',4], ['药草','🌿',9,2,55,32,.05,'药用',3],
  ].map(([name,icon,minutes,yieldCount,cost,price,weight,family,level]) => ({name,icon,minutes,yieldCount,cost,price,weight,family,level}));
  const ANIMALS = [
    ['兔','🐰',50,3,'兔毛','🧶',7,'兔肉',3], ['鸡','🐔',65,4,'鸡蛋','🥚',5,'鸡肉',3],
    ['鸭','🦆',75,4,'鸭蛋','🥚',5,'鸭肉',3], ['羊','🐑',150,6,'羊毛','🧶',10,'羊肉',5],
    ['猪','🐖',200,7,null,'',0,'猪肉',7], ['马','🐴',250,8,'马奶','🥛',8,'马肉',7],
    ['牛','🐄',300,7,'牛奶','🥛',8,'牛肉',8], ['鹅','🪿',95,5,'鹅蛋','🥚',8,'鹅肉',4],
    ['山羊','🐐',180,6,'羊奶','🥛',11,'山羊肉',5],
  ].map(([name,icon,cost,minutes,product,productIcon,price,meat,meatCount]) => ({name,icon,cost,minutes,product,productIcon,price,meat,meatCount}));
  const FISH = [
    ['鲫鱼','🐟','普通',.3,12,1], ['鲤鱼','🐠','普通',.6,20,1], ['黑鱼','🐟','普通',.8,28,2],
    ['鲈鱼','🐟','稀有',.8,40,2], ['鲑鱼','🐟','稀有',1.2,54,3], ['鳗鱼','🐟','稀有',.9,60,3],
    ['金枪鱼','🐟','史诗',2,100,4], ['河豚','🐡','史诗',.5,75,4],
    ['鲟鱼','🐟','史诗',3,140,4], ['锦鲤','🎏','传说',1.5,180,5], ['金龙鱼','🐉','传说',2.5,220,5],
  ].map(([name,icon,quality,weight,price,difficulty]) => ({name,icon,quality,weight,price,difficulty}));
  const ITEMS = Object.create(null);
  function defineItem(name, icon, category, weight, price, detail, transferable = true) {
    ITEMS[name] = {name,icon,category,weight,price,detail,transferable};
  }
  CROPS.forEach(c => defineItem(c.name,c.icon,c.name === '药草' ? '医疗药品' : '食物与水',c.weight,c.price,
    c.name === '药草' ? '小农场收获的基础药用植物，需辨识并加工，不能直接替代成药。' : '小农场收获的新鲜' + c.name + '，需清洗，按食材性质加工后食用。'));
  ANIMALS.forEach(a => {
    if (a.product) defineItem(a.product,a.productIcon,/毛/.test(a.product) ? '建筑材料' : '食物与水',/毛/.test(a.product) ? .15 : .1,a.price,
      /毛/.test(a.product) ? '小农场整理的纤维原料，可供纺织与填充。' : '小农场取得的' + a.product + '，需适当处理与保存。');
    defineItem(a.meat,'🥩','食物与水',.5,18,'小农场出产的生鲜' + a.meat + '，须彻底烹熟，无法长期常温保存。');
  });
  FISH.forEach(f => defineItem(f.name,f.icon,'食物与水',f.weight,f.price,
    f.name === '河豚' ? '有毒河豚。未经专业处理不可食用，普通烹煮不能保证去毒。' : '小农场钓获的' + f.name + '，生鲜鱼类，食用前需处理并烹熟。'));
  [
    ['木材','🪵','建筑材料',.5,12,'回收并整理的短木料，可用于简单修补。'],
    ['废铁','🔩','工具零件',.3,15,'可回收的废旧金属件，需要清理加工。'],
    ['布料','🧵','建筑材料',.1,12,'可用于缝补、包裹或加工的普通布料。'],
    ['净水','💧','食物与水',.5,15,'密封装存的净水，每份约500毫升。'],
    ['草药','🌿','医疗药品',.05,20,'待辨识加工的草药原料，不能直接替代成药。'],
    ['野果','🫐','食物与水',.2,10,'已挑拣的可食用野果，食用前需清洗。'],
    ['电池','🔋','燃料能源',.05,22,'普通便携设备用电池，具体适配情况需检查。'],
    ['电子元件','📟','工具零件',.05,30,'从废弃设备中拆出的基础电子元件。'],
    ['香料','🧂','食物与水',.05,18,'少量可用于烹饪的干燥香料。'],
    ['旧数据片','💾','其他杂物',.02,60,'未解读的旧储存介质，不保证仍可读取。'],
    ['蔬菜干','🥬','食物与水',.15,36,'小农场工坊烘干并封装的蔬菜，可作为便携食材。'],
    ['荒野炖锅','🍲','食物与水',.6,95,'熟制的土豆鱼肉炖食，应尽快食用。'],
    ['简易敷料','🩹','医疗药品',.05,48,'清洁包扎材料，用于覆盖伤口，不含抗生素或止痛药。'],
    ['便携收音机','📻','工具零件',.4,260,'工坊修复的便携接收设备，需要合适电池与信号。'],
  ].forEach(row => defineItem(...row));
  defineItem('温室营养液','🧪','其他杂物',0,0,'本地增益：接下来三次作物收获额外增加一份。',false);
  defineItem('高能精饲料','🌾','其他杂物',0,0,'本地增益：接下来三次牧场产出额外增加一份。',false);
  defineItem('闪光拟饵','✨','其他杂物',0,0,'本地增益：接下来三次垂钓的收杆区域变宽。',false);
  defineItem('探索急救包','🎒','其他杂物',0,0,'本地增益：恢复四点小院行动力。',false);
  const RECIPES = [
    {name:'蔬菜干',level:1,needs:{'白菜':2},minutes:1},
    {name:'荒野炖锅',level:1,needs:{'土豆':2,'任意鱼':1,'净水':1},minutes:2},
    {name:'温室营养液',level:2,needs:{'药草':2,'净水':1},minutes:1},
    {name:'简易敷料',level:2,needs:{'布料':2,'净水':1},minutes:1},
    {name:'高能精饲料',level:3,needs:{'豆类':3,'野果':2},minutes:1},
    {name:'闪光拟饵',level:4,needs:{'废铁':1,'布料':1,'电子元件':1},minutes:2},
    {name:'探索急救包',level:5,needs:{'草药':3,'布料':2},minutes:2},
    {name:'便携收音机',level:8,needs:{'废铁':3,'电池':2,'电子元件':2},minutes:4},
  ];
  const ZONES = [
    {key:'woodland',name:'雾林边缘',icon:'🌲',level:1,cost:2,minutes:1,risk:.08,items:['木材','野果','草药','布料'],story:'猎人小屋外有一口干燥木箱。绕过长满荆棘的路口，你找到了可用的材料。'},
    {key:'district',name:'废弃街区',icon:'🏚️',level:3,cost:3,minutes:2,risk:.16,items:['废铁','布料','净水','电池'],story:'五金铺的卷帘门只剩半扇。你从不稳的货架旁带回了一批旧物。'},
    {key:'mall',name:'沉没商场',icon:'🏬',level:6,cost:4,minutes:3,risk:.24,items:['布料','净水','香料','电池','电子元件'],story:'积水淹没了底层通道。沿扶梯上行，仓储区仍有几只完整货箱。'},
    {key:'lab',name:'旧科研站',icon:'🔬',level:10,cost:5,minutes:4,risk:.32,items:['电子元件','电池','净水','旧数据片'],story:'备用灯早已熄灭。你没有深入封闭区，只拆下外侧机柜里可用的零件。'},
  ];
  const STANCES = {careful:{name:'稳妥搜寻',risk:-.08,loot:2,time:1.3},balanced:{name:'常规搜索',risk:0,loot:3,time:1},bold:{name:'深入搜寻',risk:.15,loot:5,time:.85}};
  const RODS = [
    {key:'bamboo',name:'竹制钓竿',price:0,size:22}, {key:'wood',name:'木制钓竿',price:120,size:26},
    {key:'carbon',name:'碳素钓竿',price:350,size:30}, {key:'titanium',name:'钛合金钓竿',price:900,size:34},
    {key:'legend',name:'传说钓竿',price:2200,size:38},
  ];
  // 鱼饵沿用旧版永久购入/切换方式；工坊拟饵另作限次加成，两者可以搭配。
  const BAITS = [
    {key:'worm',name:'蚯蚓',price:0,speed:1,rare:0,desc:'稳定的基础鱼饵'},
    {key:'dough',name:'面团饵',price:25,speed:1.2,rare:.15,desc:'等待缩短，稍吸引稀有鱼'},
    {key:'shrimp',name:'虾肉饵',price:60,speed:1.4,rare:.3,desc:'稀有鱼与大鱼的吸引力更强'},
    {key:'artificial',name:'仿生饵',price:150,speed:1.7,rare:.5,desc:'咬钩更快，高品质鱼概率提高'},
    {key:'magic',name:'魔法鱼饵',price:380,speed:2,rare:.8,desc:'保留旧版特殊鱼饵，只作用于小院垂钓'},
  ];
  const SPOTS = [
    {key:'riverbank',name:'河岸浅滩',icon:'🏞️',level:1,rare:0,fish:['鲫鱼','鲤鱼','黑鱼','鲈鱼'],desc:'浅水缓流，适合练习控线'},
    {key:'reservoir',name:'废弃水库',icon:'🌊',level:3,rare:.15,fish:['鲫鱼','鲤鱼','鲈鱼','鳗鱼','鲟鱼','锦鲤'],desc:'深水大鱼，偶有鲟鱼与锦鲤'},
    {key:'ruins',name:'淹没城区',icon:'🏚️',level:6,rare:.35,fish:['鲤鱼','黑鱼','鳗鱼','锦鲤','金龙鱼'],desc:'鱼群更躁动，更容易发现水下宝箱'},
    {key:'pier',name:'旧港防波堤',icon:'⚓',level:10,rare:.3,fish:['鲈鱼','鲑鱼','金枪鱼','河豚'],desc:'海鱼专属钓点，可寻找大型金枪鱼'},
  ];
  const FISH_HABITS = {'鲫鱼':'缓游','鲤鱼':'巡游','黑鱼':'贴底','鲈鱼':'突进','鲑鱼':'逆流','鳗鱼':'折返','金枪鱼':'冲刺','河豚':'浮停','鲟鱼':'沉潜','锦鲤':'折返','金龙鱼':'疾游'};
  const TALENTS = {
    farm:{name:'轮作农艺',icon:'🌱',desc:'每级作物生长快3%；满级轮作额外多收1份'},
    ranch:{name:'温和驯养',icon:'🐓',desc:'每级产出间隔短5%；满级喂养额外多产1份'},
    fish:{name:'控线手感',icon:'🎣',desc:'每级扩大钓鱼控制条3个百分点'},
    explore:{name:'路线测绘',icon:'🧭',desc:'每级探索基础风险降低3个百分点'},
  };
  const DISCOVERIES = {
    woodland:['长满苔藓的猎人小屋','被藤蔓覆盖的路牌','一小片萤火虫栖息地'],
    district:['封死的旧药房','停止在灾变当天的公交车','写满求救信息的墙壁'],
    mall:['仍在播放广告的屏幕','被撬开的金库','屋顶上的临时菜园'],
    lab:['自循环生态舱','编号缺失的实验日志','仍有余温的备用发电机'],
  };
  const ENCOUNTERS = [
    {name:'半掩的储物门',text:'门缝中露出完好的物资箱，但锈死的铰链拦住了去路。',tool:'废铁',toolCount:1,toolLabel:'用金属件撬开',risk:.38},
    {name:'积水后的高台',text:'物资留在对面的高台上，脚下只有一段湿滑的窄梁。',tool:'布料',toolCount:2,toolLabel:'编绳加固后通过',risk:.46},
    {name:'微弱的设备指示灯',text:'角落里还有一台旧设备。稳定供电后，或许能找到备用零件的存放位置。',tool:'电池',toolCount:1,toolLabel:'接入备用电池',risk:.3},
  ];
  const MILESTONES = [
    {id:'first_harvest',name:'第一桶粮',desc:'收获1份作物',value:s=>s.stats.harvest,target:1,coins:30,items:{'净水':1}},
    {id:'harvest_100',name:'百谷丰登',desc:'累计收获100份作物',value:s=>s.stats.harvest,target:100,coins:160,items:{'温室营养液':2}},
    {id:'ranch_30',name:'牧场好手',desc:'累计取得30份畜牧产物',value:s=>s.stats.ranch,target:30,coins:130,items:{'高能精饲料':2}},
    {id:'fish_25',name:'老练渔夫',desc:'钓到25条鱼',value:s=>s.stats.fish,target:25,coins:140,items:{'闪光拟饵':2}},
    {id:'collector',name:'田园图鉴',desc:'记录8种不同产物',value:s=>Object.keys(s.collection).length,target:8,coins:220,items:{'简易敷料':2}},
    {id:'all_rounder',name:'末世庄园主',desc:'Lv.8，且农牧渔各累计30份',value:s=>s.level>=8?Math.min(s.stats.harvest,s.stats.ranch,s.stats.fish):0,target:30,coins:360,items:{'雨布挎包':1}},
    {id:'explorer_20',name:'废土旅人',desc:'完成20次探索',value:s=>s.stats.explore,target:20,coins:180,items:{'探索急救包':2}},
    {id:'crafter_15',name:'手作达人',desc:'完成15次制作',value:s=>s.stats.craft,target:15,coins:190,items:{'电子元件':3}},
    {id:'new_world',name:'地图之外',desc:'发现8处特殊地点',value:s=>s.discoveries.length,target:8,coins:300,items:{'便携收音机':1}},
    {id:'fish_master',name:'水域博物志',desc:'收集全部11种鱼',value:s=>FISH.filter(f=>s.collection[f.name]).length,target:11,coins:500,items:{'便携滤水器':1}},
    {id:'treasure_3',name:'钓线另一端',desc:'成功带回3只水下宝箱',value:s=>s.fishBook.chests,target:3,coins:120,items:{'旧数据片':2}},
    {id:'harvest_25',name:'菜篮渐满',desc:'累计收获25份作物',value:s=>s.stats.harvest,target:25,coins:60,items:{'温室营养液':1}},
    {id:'harvest_500',name:'四季粮仓',desc:'累计收获500份作物',value:s=>s.stats.harvest,target:500,coins:400,items:{'蔬菜干':4,'温室营养液':3}},
    {id:'crop_catalog',name:'十二畦的颜色',desc:'图鉴记录全部12种作物',value:s=>CROPS.filter(c=>s.collection[c.name]).length,target:12,coins:240,items:{'温室营养液':3,'净水':3}},
    {id:'ranch_1',name:'清晨的馈赠',desc:'取得第一份畜牧产物',value:s=>s.stats.ranch,target:1,coins:30,items:{'高能精饲料':1}},
    {id:'ranch_100',name:'围栏里的日常',desc:'累计取得100份畜牧产物',value:s=>s.stats.ranch,target:100,coins:240,items:{'布料':4,'高能精饲料':2}},
    {id:'ranch_300',name:'丰饶牧场',desc:'累计取得300份畜牧产物',value:s=>s.stats.ranch,target:300,coins:420,items:{'咸香蛋饼':4,'高能精饲料':3}},
    {id:'fish_1',name:'浮标第一次下沉',desc:'成功钓到第一条鱼',value:s=>s.stats.fish,target:1,coins:30,items:{'闪光拟饵':1}},
    {id:'fish_100',name:'百尾归篓',desc:'成功钓到100条鱼',value:s=>s.stats.fish,target:100,coins:340,items:{'鱼肉干':4,'闪光拟饵':3}},
    {id:'perfect_1',name:'稳稳收线',desc:'完成一次完美垂钓',value:s=>s.fishBook.perfect,target:1,coins:70,items:{'闪光拟饵':2}},
    {id:'perfect_10',name:'水面无声',desc:'累计完成10次完美垂钓',value:s=>s.fishBook.perfect,target:10,coins:260,items:{'闪光拟饵':4,'旧数据片':1}},
    {id:'heavy_fish',name:'沉甸甸的一竿',desc:'钓到一条至少4公斤的鱼',value:s=>s.fishBook.heaviest?.weight||0,target:4,unit:'公斤',coins:220,items:{'雨布挎包':1,'闪光拟饵':2}},
    {id:'explore_1',name:'推开院门',desc:'完成第一次探索',value:s=>s.stats.explore,target:1,coins:35,items:{'探路干粮':1}},
    {id:'explore_5',name:'熟悉的小径',desc:'累计完成5次探索',value:s=>s.stats.explore,target:5,coins:70,items:{'探索急救包':1,'简易敷料':1}},
    {id:'explore_60',name:'旧路新生',desc:'累计完成60次探索',value:s=>s.stats.explore,target:60,coins:400,items:{'探索急救包':3,'电池':3}},
    {id:'discovery_all',name:'余烬地图',desc:'记录全部12处特殊地点',value:s=>s.discoveries.length,target:12,coins:450,items:{'便携滤水器':1,'探路干粮':2}},
    {id:'craft_1',name:'第一件手作',desc:'完成第一次工坊制作',value:s=>s.stats.craft,target:1,coins:30,items:{'废铁':2}},
    {id:'craft_50',name:'炉火不息',desc:'累计完成50次制作',value:s=>s.stats.craft,target:50,coins:280,items:{'电子元件':4,'布料':4}},
    {id:'craft_150',name:'万物皆可修补',desc:'累计完成150次制作',value:s=>s.stats.craft,target:150,coins:480,items:{'便携收音机':1,'电池':3}},
    {id:'level_15',name:'小院长成',desc:'小院达到15级',value:s=>s.level,target:15,coins:320,items:{'雨布挎包':1,'简易敷料':3}},
    {id:'projects_3',name:'守望相助',desc:'完成全部3期公共交付',value:s=>s.projects.length,target:3,coins:350,items:{'荒野炖锅':3,'净水':4}},
    {id:'idle_home',name:'有人照看的家',desc:'建成离线值守岗',value:s=>Number(s.idle.built),target:1,coins:50,items:{'温室营养液':1,'高能精饲料':1}},
  ];
  const ACHIEVEMENT_CATEGORIES = [
    {id:'farm',name:'种植',medal:0,goals:['first_harvest','harvest_25','harvest_100','crop_catalog','harvest_500']},
    {id:'ranch',name:'牧场',medal:1,goals:['ranch_1','ranch_30','ranch_100','ranch_300']},
    {id:'fish',name:'垂钓',medal:2,goals:['fish_1','perfect_1','fish_25','treasure_3','heavy_fish','perfect_10','fish_100','fish_master']},
    {id:'explore',name:'探索',medal:3,goals:['explore_1','explore_5','explorer_20','new_world','explore_60','discovery_all']},
    {id:'craft',name:'工坊',medal:4,goals:['craft_1','crafter_15','craft_50','craft_150']},
    {id:'home',name:'经营',medal:5,goals:['collector','idle_home','all_rounder','level_15','projects_3']},
  ];
  for(const category of ACHIEVEMENT_CATEGORIES) category.goals.forEach((id,index)=>{
    const goal=MILESTONES.find(g=>g.id===id);goal.category=category.id;goal.medal=category.medal;goal.sequence=index+1;
  });
  function milestoneStatus(s,g) {
    const value=Math.max(0,Number(g.value(s))||0),claimed=s.claimedMilestones.includes(g.id);
    return {value,progress:claimed?g.target:Math.min(value,g.target),claimed,ready:!claimed&&value>=g.target};
  }
  const PROJECTS = [
    {id:'shed',name:'修好公共储物棚',needs:{'木材':6,'布料':3,'废铁':2},reward:{'雨布挎包':1},coins:100,desc:'种田与探索共同备料，做出第一件实用装备。'},
    {id:'kitchen',name:'小院周末食堂',needs:{'蔬菜干':2,'咸香蛋饼':2,'鱼肉干':1},reward:{'净水':4,'简易敷料':2},coins:180,desc:'需要农作物、畜牧、钓鱼和加工共同供货。'},
    {id:'signal',name:'点亮守望信号',needs:{'便携收音机':1,'电池':3,'旧数据片':1},reward:{'便携滤水器':1,'雨布挎包':1},coins:300,desc:'深入探索取得稀缺材料，完成最后一批设备交付。'},
  ];
  [
    ['鱼肉干','🐟','食物与水',.2,85,'经过熟制、脱水和封装的鱼肉干，便于携带。'],
    ['咸香蛋饼','🥞','食物与水',.3,70,'小院工坊制作的熟食，应尽快食用。'],
    ['雨布挎包','🎒','工具零件',.35,150,'以布料与回收材料制作的简易防泼水挎包，不改变背包规则或容量数值。'],
    ['便携滤水器','🚰','工具零件',.6,300,'基础物理过滤装置，不能保证去除病毒、毒素或化学污染，饮水仍需适当处理。'],
  ].forEach(row=>defineItem(...row));
  defineItem('探路干粮','🥨','其他杂物',0,0,'小院经营增益：接下来3次探索各少消耗1点行动力。',false);
  RECIPES.push(
    {name:'鱼肉干',level:3,needs:{'任意鱼':2,'香料':1},minutes:2},
    {name:'咸香蛋饼',level:2,needs:{'鸡蛋':1,'小麦':2},minutes:1},
    {name:'雨布挎包',level:4,needs:{'布料':4,'废铁':1},minutes:3},
    {name:'便携滤水器',level:8,needs:{'废铁':3,'布料':3,'电子元件':1},minutes:4},
    {name:'探路干粮',level:3,needs:{'小麦':2,'野果':2},minutes:1},
  );
  function expandState(s) {
    s.talents ||= {farm:0,ranch:0,fish:0,explore:0};
    s.tackle ||= {rod:RODS[clamp(int(s.upgrades.rod),0,4)].key,bait:'worm',spot:'riverbank',ownedRods:['bamboo'],ownedBaits:['worm']};
    if(!s.tackle.ownedRods.includes(s.tackle.rod)) s.tackle.ownedRods.push(s.tackle.rod);
    if(!s.tackle.ownedBaits.includes(s.tackle.bait)) s.tackle.ownedBaits.push(s.tackle.bait);
    s.fishBook ||= {longest:null,heaviest:null,perfect:0,chests:0,last:null};
    s.discoveries ||= []; s.claimedMilestones ||= []; s.projects ||= []; s.buffs.explore ||= 0;
    s.idle ||= {built:false,enabled:false,lastAt:Date.now(),budget:120,spent:0,day:'',autoPlant:false,autoFeed:false,sellSurplus:false,keep:10,lastReport:null};
    if(s.fishing && s.fishing.mode!=='stardew') {s.fishing=null;s.energy=Math.min(10+s.upgrades.tools,s.energy+1);}
    return s;
  }
  function talentPoints(s) { return Math.max(0,Math.floor(s.level/3)-Object.values(s.talents).reduce((a,b)=>a+b,0)); }
  const WEATHER = [{name:'晴朗',icon:'☀️',desc:'光照充足，生长快10%',speed:.9},{name:'小雨',icon:'🌧️',desc:'播种自带浇水照料',speed:1},{name:'薄雾',icon:'🌫️',desc:'水面平静，钓鱼控制条稍宽',speed:1},{name:'微风',icon:'🍃',desc:'风从晾晒架穿过，适合慢慢整理收获',speed:1}];
  const UPGRADES = {
    greenhouse:{name:'温室棚架',icon:'🏡',desc:'每级缩短作物生长时间5%',base:100,max:5},
    barn:{name:'舒适围栏',icon:'🪵',desc:'每级缩短畜牧产出间隔5%',base:120,max:5},
    rod:{name:'钓座整备',icon:'🎣',desc:'每级额外扩大钓鱼控制条1个百分点',base:100,max:4},
    tools:{name:'工具箱',icon:'🧰',desc:'每级增加1点行动力上限',base:90,max:5},
  };
  function makeState(now = Date.now()) {
    return {version:4,revision:0,coins:180,level:1,xp:0,energy:10,energyAt:now,theme:'dark',
      plots:Array.from({length:12},()=>({crop:null,lastFamily:''})),pens:Array(6).fill(null),bag:[],
      upgrades:{greenhouse:0,barn:0,rod:0,tools:0},buffs:{harvest:0,ranch:0,fish:0},
      stats:{harvest:0,ranch:0,fish:0,explore:0,craft:0},collection:{},day:'',daily:[],orders:[],
      workshop:[],expedition:null,fishing:null,log:[],pending:null,deliveries:[],migration:null};
  }
  function xp(s, amount) {
    s.xp += amount;
    while(s.level < 30 && s.xp >= s.level * 60) { s.xp -= s.level * 60; s.level++; s.coins += 25; }
  }
  function log(s,text,now) { s.log.unshift({text,at:now}); s.log = s.log.slice(0,50); }
  function record(s,type,count) {
    s.stats[type] = int(s.stats[type]) + count;
    s.daily.filter(t => t.type === type).forEach(t => { t.progress = Math.min(t.target,t.progress + count); });
  }
  function add(s,name,count,extra = {}) {
    requireThat(safeName(name),'物品名称无效');
    const cfg = ITEMS[name];
    const amount = int(count);
    if(!amount) return;
    const quality = ['普通','精良','稀有','史诗','传说'].includes(extra.quality) ? extra.quality : '普通';
    const weight = Math.max(0,number(extra.weight,cfg?.weight || 0));
    const existing = s.bag.find(x => x.name === name && x.quality === quality && x.weight === weight);
    if(existing) existing.count += amount;
    else s.bag.push({id:uid(),name,count:amount,quality,weight,icon:cfg?.icon || extra.icon || '📦',legacy:!cfg});
    s.collection[name] = int(s.collection[name]) + amount;
  }
  // 河豚不能被普通食谱的“任意鱼”自动消耗。
  const edibleFish = name => name !== '河豚' && FISH.some(f=>f.name===name);
  function available(s,name) { return s.bag.filter(x => name === '任意鱼' ? edibleFish(x.name) : x.name === name).reduce((a,b)=>a+b.count,0); }
  function consume(s,needs) {
    // 在副本中验证整套配方，避免“任意鱼”与指定鱼重叠时重复使用同一份库存。
    const bag = clone(s.bag);
    Object.entries(needs).sort(([a],[b])=>Number(a === '任意鱼') - Number(b === '任意鱼')).forEach(([name,count]) => {
      let left = count;
      for(const stack of bag) {
        if(!(name === '任意鱼' ? edibleFish(stack.name) : stack.name === name)) continue;
        const taken = Math.min(left,stack.count); stack.count -= taken; left -= taken;
      }
      requireThat(!left,'材料不足：' + name);
    });
    s.bag = bag.filter(x=>x.count>0);
  }
  function updateDay(s,now) {
    const day = dayKey(now);
    // 系统时间回退不刷新委托或行动力。
    if(s.day && day <= s.day) return;
    s.day = day;
    s.daily = [{id:'harvest',type:'harvest',name:'收好一篮菜',target:6,reward:40},
      {id:'fish',type:'fish',name:'今天的渔获',target:2,reward:35},
      {id:'explore',type:'explore',name:'出门走一趟',target:1,reward:30}].map(t=>({...t,progress:0,claimed:false}));
    const crop = CROPS[hash(day) % Math.min(CROPS.length,4)];
    s.orders = [
      {id:'vegetable',name:'邻里菜篮',needs:{[crop.name]:3},reward:crop.price*4 + 15,done:false},
      {id:'pantry',name:'储藏室补货',needs:{'土豆':2,'小麦':2},reward:65,done:false},
      {id:'repair',name:'修补小屋',needs:{'木材':2,'布料':1},reward:65,done:false},
    ];
  }
  function tick(s,now = Date.now()) {
    expandState(s);
    updateDay(s,now);
    const maxEnergy = 10 + s.upgrades.tools;
    const gained = Math.floor(Math.max(0,now - s.energyAt) / (5*MINUTE));
    if(gained) { s.energy = Math.min(maxEnergy,s.energy+gained); s.energyAt += gained*5*MINUTE; }
    if(s.energy >= maxEnergy) s.energyAt = Math.max(s.energyAt,now);
    // 进度由绝对时间计算；关闭页面不跑模拟循环、不自动出售、不自动外送。
    return s;
  }
  function weather(s) { return WEATHER[hash(s.day) % WEATHER.length]; }
  function ready(plot,now) { return !!plot?.crop && now >= plot.readyAt; }
  function cost(s,coins,energy = 0) {
    requireThat(s.coins >= coins,'小院币不足');
    requireThat(s.energy >= energy,'行动力不足，稍作休息再来');
    s.coins -= coins; s.energy -= energy;
  }
  function action(s,type,arg = {},now = Date.now(),roll = Math.random) {
    tick(s,now);
    let message = '';
    if(type === 'plant') {
      const crop = CROPS.find(x=>x.name === arg.name), plot = s.plots[arg.index];
      requireThat(crop && plot && !plot.crop,'这块土地暂时不能播种');
      requireThat(s.level >= crop.level,'小院等级不足');
      cost(s,crop.cost);
      const rotation = !!plot.lastFamily && plot.lastFamily !== crop.family;
      s.plots[arg.index] = {crop:crop.name,lastFamily:plot.lastFamily,plantedAt:now,
        readyAt:now + crop.minutes*MINUTE*(1-s.upgrades.greenhouse*.05-s.talents.farm*.03)*weather(s).speed*(rotation ? .9 : 1),
        rotation,watered:weather(s).name === '小雨',tended:false,trouble:roll()<.18?(roll()<.5?'杂草':'虫害'):null};
      message = '种下' + crop.name + (rotation ? '，轮作让这一茬更有活力' : '');
    } else if(type === 'care') {
      const plot = s.plots[arg.index];
      requireThat(plot?.crop && !ready(plot,now),'这块地暂时不需要照料');
      if(!plot.watered) { plot.watered = true; plot.readyAt -= Math.min(MINUTE,(plot.readyAt-now)*.15); message = '浇过水了，生长进度向前推进'; }
      else { requireThat(!plot.tended,'本茬已经照料完毕'); cost(s,4); plot.tended = true; message = '整理了枝叶，收获时额外增加一份'; }
    } else if(type === 'clear-trouble') {
      const plot=s.plots[arg.index];requireThat(plot?.crop && plot.trouble,'这块地不需要处理');
      cost(s,2);message='已处理'+plot.trouble+'，这一茬不会减产';plot.trouble=null;
    } else if(type === 'harvest' || type === 'harvest-all') {
      const indices = type === 'harvest-all' ? s.plots.map((_,i)=>i).filter(i=>ready(s.plots[i],now)) : [arg.index];
      requireThat(indices.length,'暂时没有成熟作物');
      let total = 0;
      indices.forEach(index => {
        const plot = s.plots[index]; requireThat(ready(plot,now),'作物还没有成熟');
        const crop = CROPS.find(x=>x.name === plot.crop);
        const bonus = s.buffs.harvest > 0 ? 1 : 0;
        if(bonus) s.buffs.harvest--;
        const amount = Math.max(1,crop.yieldCount + Number(plot.tended) + Number(plot.rotation) + bonus + Number(plot.rotation&&s.talents.farm===3) - Number(!!plot.trouble));
        add(s,crop.name,amount,{quality:plot.tended && plot.watered ? '精良' : '普通'});
        total += amount; s.plots[index] = {crop:null,lastFamily:crop.family,lastCrop:crop.name};
      });
      record(s,'harvest',total); xp(s,total*3); message = '收获 ' + total + ' 份作物，已收入仓库';
    } else if(type === 'buy-animal') {
      const animal = ANIMALS.find(x=>x.name === arg.name);
      requireThat(animal && arg.index >= 0 && arg.index < 6 && !s.pens[arg.index],'围栏暂时不可用');
      cost(s,animal.cost);
      s.pens[arg.index] = {name:animal.name,placedAt:now,readyAt:now+animal.minutes*MINUTE*(1-s.upgrades.barn*.05-s.talents.ranch*.05),affection:0,fed:false};
      message = animal.name + '住进了围栏';
    } else if(type === 'feed') {
      const pen = s.pens[arg.index]; requireThat(pen && !pen.fed,'本轮已经喂过了');
      cost(s,3); pen.fed = true; pen.affection = Math.min(3,pen.affection+1);
      pen.readyAt -= Math.min(MINUTE,Math.max(0,pen.readyAt-now)*.2); message = '添好饲料，它对你更亲近了';
    } else if(type === 'collect' || type === 'slaughter') {
      const pen = s.pens[arg.index], animal = ANIMALS.find(x=>x.name === pen?.name);
      requireThat(animal && now >= pen.readyAt,'动物还没准备好');
      requireThat(type === 'slaughter' || animal.product,'这类动物只产肉');
      const amount = type === 'slaughter' ? animal.meatCount : 1 + Number(pen.fed) + Number(s.buffs.ranch > 0) + Number(pen.fed&&s.talents.ranch===3);
      add(s,type === 'slaughter' ? animal.meat : animal.product,amount,{quality:pen.affection >= 3 ? '精良' : '普通'});
      if(type === 'slaughter') s.pens[arg.index] = null;
      else { if(s.buffs.ranch) s.buffs.ranch--; pen.readyAt = now+animal.minutes*MINUTE*(1-s.upgrades.barn*.05-s.talents.ranch*.05); pen.fed = false; }
      record(s,'ranch',amount); xp(s,amount*5); message = '取得 ' + amount + ' 份' + (type === 'slaughter' ? animal.meat : animal.product);
    } else if(type === 'explore') {
      const zone = ZONES.find(x=>x.key === arg.zone), stance = STANCES[arg.stance];
      requireThat(zone && stance && s.level >= zone.level,'路线尚未开放');
      requireThat(!s.expedition,'先领取上一次探索收获');
      cost(s,0,Math.max(1,zone.cost-Number(s.buffs.explore>0)));if(s.buffs.explore)s.buffs.explore--;
      const success = roll() >= clamp(zone.risk+stance.risk-s.talents.explore*.03,0,.8);
      const rewards = {};
      for(let i=0;i<(success ? stance.loot : 1);i++) {
        const item = zone.items[Math.min(zone.items.length-1,Math.floor(roll()*zone.items.length))];
        rewards[item] = (rewards[item] || 0)+1;
      }
      const duration=zone.minutes*MINUTE*stance.time;
      s.expedition = {zone:zone.key,stance:arg.stance,startedAt:now,readyAt:now+duration,success,rewards,
        encounter:{index:Math.floor(roll()*ENCOUNTERS.length),at:now+duration*.4,roll:roll(),choice:null},coins:success?8+Math.floor(roll()*15)*(ZONES.indexOf(zone)+1):0};
      message = '已出发：' + zone.name + ' · ' + stance.name;
    } else if(type === 'explore-choice') {
      const trip=s.expedition,event=trip?.encounter,enc=event&&ENCOUNTERS[event.index];
      requireThat(event && now>=event.at && !event.choice,'当前没有待选择的探索事件');
      requireThat(['safe','tool','risk'].includes(arg.choice),'请选择有效的路线');
      let extra=0;
      if(arg.choice==='tool') {consume(s,{[enc.tool]:enc.toolCount});extra=3;message=enc.toolLabel+'，安全带回额外物资';}
      else if(arg.choice==='risk') {
        if(event.roll>=enc.risk-s.talents.explore*.03) {extra=4;message='冒险成功，找到了额外的物资箱';}
        else {trip.readyAt+=45000;message='尝试没有成功，只能绕路折返，额外耗时45秒';}
      } else message='记下位置，不冒险，按原路线返回';
      event.choice=arg.choice;
      const zone=ZONES.find(z=>z.key===trip.zone);
      if(extra) {const reward=zone.items.at(-1);trip.rewards[reward]=(trip.rewards[reward]||0)+extra;}
      const discovery=DISCOVERIES[trip.zone][event.index];
      if(!s.discoveries.includes(discovery)) {s.discoveries.push(discovery);xp(s,12);message+='；新发现：'+discovery;}
    } else if(type === 'claim-explore') {
      const trip = s.expedition; requireThat(trip && now >= trip.readyAt,'探索尚未结束');
      requireThat(!trip.encounter || trip.encounter.choice,'请先决定探索途中遇到的事件');
      const zone = ZONES.find(x=>x.key === trip.zone);
      Object.entries(trip.rewards).forEach(([name,count])=>add(s,name,count));
      s.coins+=trip.coins||0;
      xp(s,trip.success ? 20 : 8); record(s,'explore',1); s.expedition = null;
      message = trip.success ? zone.story : '路线前方出现险情，你及时折返，只带回少量材料。没有损失已有库存。';
    } else if(type === 'craft') {
      const recipe = RECIPES.find(x=>x.name === arg.name);
      requireThat(recipe && s.level >= recipe.level,'配方尚未解锁');
      requireThat(s.workshop.length < 3,'工坊最多同时处理三项制作');
      consume(s,recipe.needs); s.workshop.push({id:uid(),name:recipe.name,readyAt:now+recipe.minutes*MINUTE});
      message = recipe.name + '开始制作';
    } else if(type === 'claim-craft') {
      const job = s.workshop.find(x=>x.id === arg.id);
      requireThat(job && now >= job.readyAt,'制作尚未完成');
      add(s,job.name,1); s.workshop = s.workshop.filter(x=>x.id !== job.id);
      record(s,'craft',1); xp(s,15); message = job.name + '已收入仓库';
    } else if(type === 'use') {
      const stack = s.bag.find(x=>x.id === arg.id);
      const buff = {'温室营养液':'harvest','高能精饲料':'ranch','闪光拟饵':'fish','探路干粮':'explore'}[stack?.name];
      requireThat(stack && (buff || stack.name === '探索急救包'),'这件物品不能在小院使用');
      if(stack.name === '探索急救包') { requireThat(s.energy < 10+s.upgrades.tools,'行动力已充满'); s.energy = Math.min(10+s.upgrades.tools,s.energy+4); }
      else s.buffs[buff] += 3;
      stack.count--; s.bag = s.bag.filter(x=>x.count>0); message = '已使用' + stack.name;
    } else if(type === 'sell') {
      const stack = s.bag.find(x=>x.id === arg.id), count = int(arg.count);
      requireThat(stack && count && count <= stack.count,'出售数量无效');
      requireThat(ITEMS[stack.name]?.price > 0,'这件物品暂时不能出售');
      const price = Math.floor(ITEMS[stack.name].price * count * (stack.quality === '精良' ? 1.2 : 1));
      stack.count -= count; s.bag = s.bag.filter(x=>x.count>0); s.coins += price;
      message = '出售获得 ' + price + ' 小院币';
    } else if(type === 'order') {
      const order = s.orders.find(x=>x.id === arg.id);
      requireThat(order && !order.done,'这项交付已经完成');
      consume(s,order.needs); order.done = true; s.coins += order.reward; xp(s,20);
      message = '完成' + order.name + '，获得 ' + order.reward + ' 小院币';
    } else if(type === 'daily') {
      const task = s.daily.find(x=>x.id === arg.id);
      requireThat(task && !task.claimed && task.progress >= task.target,'这份奖励还不能领取');
      task.claimed = true; s.coins += task.reward; xp(s,10); message = '已领取今日奖励';
    } else if(type === 'upgrade') {
      const cfg = UPGRADES[arg.key], level = s.upgrades[arg.key];
      requireThat(cfg && level < cfg.max,'设施已经升满');
      cost(s,cfg.base*(level+1)); s.upgrades[arg.key]++; message = cfg.name + '升级完成';
    } else if(type === 'talent') {
      requireThat(TALENTS[arg.key] && s.talents[arg.key]<3 && talentPoints(s)>0,'暂时没有可用的心得点');
      s.talents[arg.key]++;message='学会了 '+TALENTS[arg.key].name+' '+s.talents[arg.key]+'级';
    } else if(type === 'build-idle') {
      requireThat(!s.idle.built && s.level>=3,'值守岗尚未开放或已经建成');
      requireThat(s.coins>=80,'需要80小院币');consume(s,{'木材':6,'布料':3});cost(s,80);
      s.idle.built=true;s.idle.lastAt=now;message='值守岗已建成，可按自己的节奏开启代收与补种';
    } else if(type === 'idle-config') {
      requireThat(s.idle.built,'先建成值守岗');
      for(const key of ['enabled','autoPlant','autoFeed','sellSurplus']) if(own(arg,key)) s.idle[key]=arg[key]===true;
      if(own(arg,'budget'))s.idle.budget=clamp(int(arg.budget),0,1000);
      if(own(arg,'keep'))s.idle.keep=clamp(int(arg.keep),1,100);
      s.idle.lastAt=now;message=s.idle.enabled?'值守已按当前安排运行':'值守已暂停，作物仍会自然生长';
    } else if(type === 'milestone') {
      const goal=MILESTONES.find(g=>g.id===arg.id);
      requireThat(goal && milestoneStatus(s,goal).ready,'这份成就奖励暂不能领取');
      s.claimedMilestones.push(goal.id);s.coins+=goal.coins;
      Object.entries(goal.items).forEach(([name,count])=>add(s,name,count));message='完成成就「'+goal.name+'」，物资已放入仓库';
    } else if(type === 'project') {
      const project=PROJECTS[s.projects.length];requireThat(project && project.id===arg.id,'当前交付项目已变化');
      consume(s,project.needs);s.projects.push(project.id);s.coins+=project.coins;xp(s,50);
      Object.entries(project.reward).forEach(([name,count])=>add(s,name,count));message='完成「'+project.name+'」，实物奖励已入库';
    } else if(type === 'tackle') {
      requireThat(!s.fishing,'先结束当前这一竿，再更换装备');
      const pools={rod:RODS,bait:BAITS,spot:SPOTS},entry=pools[arg.kind]?.find(x=>x.key===arg.key);
      requireThat(entry && s.level>=(entry.level||1),'这项配置尚未解锁');
      if(arg.kind!=='spot') {
        const owned=arg.kind==='rod'?s.tackle.ownedRods:s.tackle.ownedBaits;
        if(!owned.includes(entry.key)) {cost(s,entry.price);owned.push(entry.key);}
      }
      s.tackle[arg.kind]=entry.key;message='已选用'+entry.name;
    } else if(type === 'cast') {
      requireThat(!s.fishing,'已有一竿在水中');
      cost(s,0,1);
      const spot=SPOTS.find(x=>x.key===s.tackle.spot),bait=BAITS.find(x=>x.key===s.tackle.bait),rod=RODS.find(x=>x.key===s.tackle.rod);
      requireThat(s.level>=spot.level,'该钓点尚未开放');
      const pool=FISH.filter(x=>spot.fish.includes(x.name)),bonus=spot.rare+bait.rare+Number(s.buffs.fish>0)*.35;
      const weights=pool.map(f=>({普通:60,稀有:20,史诗:5,传说:1}[f.quality])*(1+(f.difficulty-1)*bonus));
      let picked=roll()*weights.reduce((a,b)=>a+b,0), fish=pool.at(-1);
      for(let i=0;i<pool.length;i++){picked-=weights[i];if(picked<=0){fish=pool[i];break;}}
      const size=clamp(rod.size+s.upgrades.rod+s.talents.fish*3+Number(s.buffs.fish>0)*5+(weather(s).name==='薄雾'?2:0),20,50);
      if(s.buffs.fish) s.buffs.fish--;
      s.fishing = {mode:'stardew',id:uid(),owner:arg.owner||'local',name:fish.name,spot:spot.key,startedAt:now,
        biteAt:now+Math.floor((3500+roll()*4000)/bait.speed),expiresAt:now+90000,phase:'waiting',lastActiveAt:now,
        weight:Number((fish.weight*(.6+roll()*.9)).toFixed(2)),length:Number(((15+fish.difficulty*8)*(.8+roll()*.4)).toFixed(1)),
        engine:makeFishEngine(fish,size,Math.floor(roll()*0xffffffff),roll()<(spot.key==='ruins'?.3:.16))};
      message = '抛竿了，鱼咬钩后点「提竿」，再控制钓鱼条追鱼';
    } else if(type === 'hook' || type === 'resume-fish') {
      const f=s.fishing;requireThat(f?.mode==='stardew','请先抛竿');
      requireThat(!f.owner || f.owner===arg.owner || now-f.lastActiveAt>4000,'这一竿正在另一个窗口操作，请先在那里收起小院');
      if(f.phase==='waiting') {requireThat(now>=f.biteAt,'鱼还没咬钩');requireThat(now<=f.expiresAt,'已经错过咬钩，请结束这一竿重新抛竿');f.phase='fight';}
      f.owner=arg.owner||'local';f.lastActiveAt=now;message='按住上浮，松开下沉，让铜橙色控制条跟住鱼';
    } else if(type === 'land-fish') {
      const f=s.fishing;requireThat(f && f.id===arg.id && f.owner===arg.owner,'当前垂钓会话已变化');
      requireThat(['won','lost'].includes(f.engine.result),'这一竿还没有结束');
      if(f.engine.result==='won') {
        const fish=FISH.find(x=>x.name===f.name),perfect=f.engine.insideTime/Math.max(.01,f.engine.elapsed)>=.88;
        const quality=perfect&&fish.quality==='普通'?'精良':fish.quality;
        add(s,f.name,1,{quality,weight:f.weight});record(s,'fish',1);xp(s,perfect?24:14);
        const recordFish={name:f.name,weight:f.weight,length:f.length,quality,spot:f.spot,at:now,perfect};
        s.fishBook.last=recordFish;if(perfect)s.fishBook.perfect++;
        if(!s.fishBook.heaviest || f.weight>s.fishBook.heaviest.weight)s.fishBook.heaviest=recordFish;
        if(!s.fishBook.longest || f.length>s.fishBook.longest.length)s.fishBook.longest=recordFish;
        message=(perfect?'完美控线！':'成功钓获！')+f.name+' · '+f.weight+' kg · '+f.length+' cm，已入库';
        if(f.engine.chestCaught){const reward=['废铁','布料','电池','电子元件'][hash(f.id)%4];add(s,reward,2);s.fishBook.chests++;message+='；宝箱带回 '+reward+' ×2';}
      } else {xp(s,2);message='鱼挣脱了，没有损失已有渔获。换一支长控制条钓竿试试。';}
      s.fishing=null;
    } else if(type === 'cancel-fish') { requireThat(s.fishing,'当前没有垂钓'); s.fishing = null; message = '收好钓具，本次行动力已消耗'; }
    else throw new Error('未知操作');
    log(s,message,now); return message;
  }
  function makeFishEngine(fish,size,seed,chest) {
    return {bar:50,velocity:0,size,fish:50,fishVelocity:0,fishTimer:.8,fishMode:'停驻',difficulty:fish.difficulty,
      habit:FISH_HABITS[fish.name],seed:seed>>>0,progress:30,elapsed:0,insideTime:0,inside:false,result:null,
      chest,chestAt:20+(seed%60),chestProgress:0,chestCaught:false};
  }
  function fishRandom(engine) {engine.seed=(Math.imul(engine.seed,1664525)+1013904223)>>>0;return engine.seed/4294967296;}
  function stepFish(engine,held,seconds) {
    if(engine.result)return engine;
    const dt=clamp(number(seconds),0,.05),diff=engine.difficulty;
    engine.elapsed+=dt;engine.fishTimer-=dt;
    if(engine.fishTimer<=0) {
      const r=fishRandom(engine),direction=fishRandom(engine)<.5?-1:1;
      engine.fishTimer=.45+fishRandom(engine)*(.9-diff*.08);
      if(r<.24) {engine.fishVelocity=0;engine.fishMode='停驻';}
      else {const dash=r>.84;engine.fishVelocity=direction*(8+diff*4+fishRandom(engine)*10)*(dash?1.7:1);engine.fishMode=dash?'突进':direction<0?'上浮':'下潜';}
      if(engine.habit==='贴底' && engine.fish<65)engine.fishVelocity=Math.abs(engine.fishVelocity);
      if(engine.habit==='逆流' && engine.fish>35)engine.fishVelocity=-Math.abs(engine.fishVelocity);
      if(engine.habit==='折返')engine.fishVelocity=(engine.fish<50?1:-1)*Math.abs(engine.fishVelocity);
    }
    engine.fish=clamp(engine.fish+engine.fishVelocity*dt,6,94);
    if(engine.fish<=6||engine.fish>=94)engine.fishVelocity*=-.6;
    engine.velocity=clamp((engine.velocity+(held?-140:90)*dt)*Math.exp(-2.4*dt),-66,66);
    engine.bar+=engine.velocity*dt;
    if(engine.bar<engine.size/2){engine.bar=engine.size/2;engine.velocity=Math.abs(engine.velocity)*.2;}
    if(engine.bar>100-engine.size/2){engine.bar=100-engine.size/2;engine.velocity=-Math.abs(engine.velocity)*.2;}
    engine.inside=Math.abs(engine.bar-engine.fish)<=engine.size/2+3;
    if(engine.inside){engine.insideTime+=dt;engine.progress+=16*dt;}
    else if(engine.elapsed>1.5)engine.progress-=(5+diff*1.1)*dt;
    if(engine.chest && !engine.chestCaught && engine.elapsed>2 && Math.abs(engine.bar-engine.chestAt)<engine.size/2) {
      engine.chestProgress=clamp(engine.chestProgress+dt/1.3,0,1);if(engine.chestProgress>=1)engine.chestCaught=true;
    }
    engine.progress=clamp(engine.progress,0,100);
    if(engine.progress>=100)engine.result='won';
    else if(engine.progress<=0 || engine.elapsed>=90)engine.result='lost';
    return engine;
  }
  function settleIdle(s,now=Date.now()) {
    expandState(s);const idle=s.idle;
    if(!idle.enabled||!idle.built)return null;
    const original=idle.lastAt,start=Math.max(original,now-8*60*MINUTE);
    const slots=Math.min(480,Math.floor(Math.max(0,now-start)/MINUTE));
    if(!slots)return null;
    const report={at:now,minutes:slots,harvest:0,ranch:0,craft:0,planted:0,spent:0,sold:0,earned:0,capped:now-original>8*60*MINUTE,full:false};
    const oldLog=clone(s.log),rand=()=>((hash(String(idle.lastAt)+':'+s.coins)%1000)/1000);
    for(let k=1;k<=slots;k++) {
      const moment=start+k*MINUTE,day=dayKey(moment);
      if(day>idle.day){idle.day=day;idle.spent=0;}
      const canSpend=n=>idle.spent+n<=idle.budget && s.coins>=n;
      const charge=n=>{idle.spent+=n;report.spent+=n;};
      if(idle.sellSurplus) {
        for(const row of [...s.bag]) {
          const cfg=ITEMS[row.name];
          if(row.quality!=='普通' || !cfg?.price || !['食物与水','建筑材料'].includes(cfg.category) || row.count<=idle.keep)continue;
          const count=row.count-idle.keep,before=s.coins;action(s,'sell',{id:row.id,count},moment);report.earned+=s.coins-before;report.sold+=count;
        }
      }
      for(let i=0;i<s.plots.length;i++) {
        const full=s.bag.reduce((a,b)=>a+b.count,0)>=200;if(full){report.full=true;break;}
        let plot=s.plots[i];
        if(ready(plot,moment)) {const before=s.stats.harvest;action(s,'harvest',{index:i},moment);report.harvest+=s.stats.harvest-before;}
        plot=s.plots[i];const crop=CROPS.find(c=>c.name===plot.lastCrop);
        if(idle.autoPlant && !plot.crop && crop && s.level>=crop.level && canSpend(crop.cost)) {action(s,'plant',{index:i,name:crop.name},moment,rand);charge(crop.cost);report.planted++;}
      }
      for(let i=0;i<s.pens.length;i++) {
        const pen=s.pens[i];if(!pen)continue;
        if(s.bag.reduce((a,b)=>a+b.count,0)>=200){report.full=true;break;}
        const animal=ANIMALS.find(a=>a.name===pen.name);
        if(idle.autoFeed&&!pen.fed&&canSpend(3)){action(s,'feed',{index:i},moment);charge(3);}
        if(animal.product&&moment>=pen.readyAt){const before=s.stats.ranch;action(s,'collect',{index:i},moment);report.ranch+=s.stats.ranch-before;}
      }
      for(const job of [...s.workshop]) if(moment>=job.readyAt && s.bag.reduce((a,b)=>a+b.count,0)<200) {action(s,'claim-craft',{id:job.id},moment);report.craft++;}
      idle.lastAt=moment;
    }
    // 挂机批次合并成一条手记，避免每分钟刷日志。没有自动探索、钓鱼、出栏或外送。
    s.log=oldLog;if(report.harvest||report.ranch||report.craft||report.planted||report.sold||!idle.lastReport)idle.lastReport=report;tick(s,now);
    if(report.harvest||report.ranch||report.craft||report.planted||report.sold)log(s,'值守 '+slots+' 分钟：代收作物 '+report.harvest+'、畜牧 '+report.ranch+'、工坊 '+report.craft+'，补种 '+report.planted+' 块，花费 '+report.spent+' 币。',now);
    return report;
  }
  function migrate(legacy,now = Date.now()) {
    const s = makeState(now), old = legacy || {}, farm = old.farm || {}, ranch = old.ranch || {}, fish = old.fish || {}, meta = old.meta || {};
    const found = Object.values(old).some(v=>obj(v) && Object.keys(v).length);
    if(!found) { tick(s,now); return s; }
    s.coins = int(fish.money == null ? 180 : fish.money,Number.MAX_SAFE_INTEGER);
    s.level = clamp(int(meta.level || 1),1,30); s.xp = int(meta.xp);
    s.theme = /light/.test(old.config?.theme || '') ? 'light' : 'dark';
    s.energy = clamp(int(meta.adventure?.energy ?? 10),0,10);
    s.energyAt = number(meta.adventure?.lastEnergyAt,now);
    s.upgrades.greenhouse = clamp(int(farm.upgrades?.growthSpeed),0,5);
    s.upgrades.barn = clamp(int(ranch.upgrades?.growthSpeed),0,5);
    s.upgrades.rod = clamp(['bamboo','wood','carbon','titanium','legend'].indexOf(fish.currentRod),0,4);
    for(const key of Object.keys(s.stats)) s.stats[key] = int(meta.totalActions?.[key]);
    s.plots = s.plots.map((empty,i)=>{
      const plot = farm.plots?.[i], crop = CROPS.find(c=>c.name === plot?.crop);
      return crop ? {crop:crop.name,lastFamily:'',plantedAt:number(plot.plantedAt,now),readyAt:number(plot.plantedAt,now)+crop.minutes*MINUTE,watered:plot.water>=50,tended:plot.fertilizer>=80,rotation:false} : empty;
    });
    s.pens = s.pens.map((empty,i)=>{
      const pen = ranch.pens?.[i], animal = ANIMALS.find(a=>a.name === pen?.animal);
      return animal ? {name:animal.name,placedAt:number(pen.placedAt,now),readyAt:number(pen.lastProductTime || pen.placedAt,now)+animal.minutes*MINUTE,affection:0,fed:false} : empty;
    });
    for(const row of [...(Array.isArray(ranch.tempBag) ? ranch.tempBag : []),...(Array.isArray(fish.inventory) ? fish.inventory : [])]) {
      if(safeName(row?.name)) add(s,row.name,row.count ?? 1,{quality:row.quality || row.rarity,weight:row.weight,icon:row.icon});
    }
    Object.entries(meta.adventure?.materials || {}).forEach(([name,count])=>{if(safeName(name)) add(s,name,count);});
    const oldCrafts = {stew:'荒野炖锅',nutrient:'温室营养液',feedmix:'高能精饲料',lure:'闪光拟饵',medkit:'探索急救包',radio:'便携收音机'};
    Object.entries(meta.workshop?.crafted || {}).forEach(([key,count])=>{if(oldCrafts[key]) add(s,oldCrafts[key],count);});
    for(const key of Object.keys(s.buffs)) s.buffs[key] = int(meta.workshop?.buffs?.[key]);
    Object.entries(meta.mastery?.products || {}).forEach(([name,count])=>{
      if(safeName(name)) s.collection[name] = Math.max(int(s.collection[name]),int(count));
    });
    // 退还本版不再使用的设施投入；成长设施超出新版上限的等级也按旧售价退还。
    let refund = 0;
    const retired = [[farm.upgrades,'yieldBonus',60,50,0],[farm.upgrades,'eventResist',45,35,0],
      [farm.upgrades,'soilCare',40,30,0],[ranch.upgrades,'productBonus',65,55,0],
      [ranch.upgrades,'meatBonus',70,60,0],[ranch.upgrades,'eventResist',50,40,0],
      [farm.upgrades,'growthSpeed',50,40,5],[ranch.upgrades,'growthSpeed',55,45,5]];
    retired.forEach(([upgrades,key,base,step,keep])=>{for(let i=keep;i<clamp(int(upgrades?.[key]),0,10);i++) refund+=base+step*i;});
    s.coins += refund;
    s.migration = {at:now,version:3,refund};
    expandState(s);
    if(BAITS.some(b=>b.key===fish.currentBait)) {s.tackle.bait=fish.currentBait;s.tackle.ownedBaits.push(fish.currentBait);}
    if(SPOTS.some(x=>x.key===fish.currentSpot))s.tackle.spot=fish.currentSpot;
    s.fishBook.longest=fish.records?.longest || null;s.fishBook.heaviest=fish.records?.heaviest || null;
    s.discoveries=Array.isArray(meta.adventure?.discoveries)?meta.adventure.discoveries.filter(x=>typeof x==='string'):[];
    s.claimedMilestones=Array.isArray(meta.achievements)?meta.achievements.filter(x=>typeof x==='string'):[];
    tick(s,now); log(s,'旧小院已迁入：资金、在田作物、牲畜、库存与经营经验已保留。原始存档另行封存。',now);
    if(refund) log(s,'旧设施折算退回 '+refund+' 小院币，可用于新版建设。',now);
    return s;
  }
  function itemPayload(stack,count) {
    const cfg = ITEMS[stack?.name];
    requireThat(cfg?.transferable && safeName(stack.name),'这件物品只在小院内使用');
    requireThat(Number.isSafeInteger(count) && count > 0 && count <= stack.count,'转入数量无效');
    return {emoji:cfg.icon,count,quality:stack.quality,weight:stack.weight,condition:100,category:cfg.category,detail:cfg.detail};
  }
  function reserve(s,id,count,target,now = Date.now()) {
    requireThat(!s.pending,'还有一笔装箱等待核对，请先处理');
    const stack = s.bag.find(x=>x.id === id);
    requireThat(stack,'仓库中已没有这件物品');
    const item = itemPayload(stack,count);
    const pending = {id:uid(),name:stack.name,item,stack:clone({...stack,count}),target:clone(target),at:now};
    stack.count -= count; s.bag = s.bag.filter(x=>x.count>0); s.pending = pending;
    return pending;
  }
  function finishTransfer(s,id) {
    requireThat(s.pending?.id === id,'装箱状态已变化');
    const pending = s.pending;
    s.deliveries.unshift({id,name:pending.name,count:pending.item.count,at:Date.now(),target:pending.target.label});
    s.deliveries = s.deliveries.slice(0,60); s.pending = null;
  }
  function restoreTransfer(s,id) {
    requireThat(s.pending?.id === id,'装箱状态已变化');
    const row = s.pending.stack;
    const found = s.bag.find(x=>x.name===row.name && x.quality===row.quality && x.weight===row.weight);
    if(found) found.count += row.count;
    else s.bag.push(clone(row));
    s.pending = null;
  }
  function mergeReward(variables,pending) {
    requireThat(obj(variables?.stat_data) && obj(variables.stat_data.物品),'当前楼层背包未初始化');
    const receipts = obj(variables[RECEIPTS]) ? variables[RECEIPTS] : {};
    if(own(receipts,pending.id)) return {variables,duplicate:true,name:receipts[pending.id].name};
    const next = clone(variables), bag = next.stat_data.物品;
    const base = pending.name, item = clone(pending.item);
    let name = base, suffix = 0;
    const compatible = old => obj(old) && !old.type && old.category === item.category && old.quality === item.quality
      && old.condition === item.condition && old.weight === item.weight && old.detail === item.detail
      && Number.isSafeInteger(old.count) && old.count >= 0
      && Object.keys(old).every(key=>own(item,key));
    // 未知附加属性或同名不同品质均不覆盖；同质堆叠只改 count。
    while(own(bag,name) && !compatible(bag[name])) name = base + '·小院' + (++suffix === 1 ? '' : suffix);
    if(own(bag,name)) { requireThat(Number.isSafeInteger(bag[name].count+item.count),'背包数量超出范围'); bag[name].count += item.count; }
    else bag[name] = item;
    next[RECEIPTS] = {...receipts,[pending.id]:{name,count:item.count,at:pending.at}};
    return {variables:next,duplicate:false,name};
  }
  const Core = {VERSION,KEY,RECEIPTS,CROPS,ANIMALS,FISH,ITEMS,RECIPES,ZONES,STANCES,UPGRADES,WEATHER,RODS,BAITS,SPOTS,TALENTS,MILESTONES,ACHIEVEMENT_CATEGORIES,milestoneStatus,PROJECTS,ENCOUNTERS,
    makeState,tick,dayKey,weather,action,makeFishEngine,stepFish,settleIdle,talentPoints,migrate,reserve,mergeReward,finishTransfer,restoreTransfer,itemPayload,available,consume,clone,hash};
  if(typeof window === 'undefined' && typeof module !== 'undefined' && module.exports) { module.exports = Core; return; }
  // 浏览器界面与持久化实现在下方。
  start().catch(error => { console.error('[小农场]',error); });
  async function start() {
    const p = (()=>{if(window.__GARDEN_PREVIEW__ === true) return window; try { void window.parent.document.body; return window.parent; } catch { return window; }})();
    const doc = p.document;
    if(!doc.body)await new Promise(resolve=>doc.addEventListener('DOMContentLoaded',resolve,{once:true}));
    const preview = window.__GARDEN_PREVIEW__ === true;
    const stateKey = preview ? KEY + '_preview' : KEY;
    // Art is pinned independently of script releases; preview resolves the same files locally.
    const ART_REV = '0976c09196e1df8fe9634090b683c6dcffc812fd';
    const artBases = [
      'https://testingcf.jsdelivr.net/gh/NLKASHEI/JMZQFarm@'+ART_REV+'/assets/v4.2/',
      'https://cdn.jsdelivr.net/gh/NLKASHEI/JMZQFarm@'+ART_REV+'/assets/v4.2/',
      'https://raw.githubusercontent.com/NLKASHEI/JMZQFarm/'+ART_REV+'/assets/v4.2/',
    ];
    if(preview) artBases.unshift(new URL(window.__GARDEN_ASSET_BASE__||'assets/v4.2/',window.location.href).href);
    const oldCleanup = p._farmCleanup || window._farmCleanup;
    if(typeof oldCleanup === 'function') await oldCleanup();
    doc.getElementById('jmzq-garden')?.remove();
    let alive = true, busy = false, db, state, tab = 'overview', lastReady = '', interval;
    let blockedByGeneration = false, blockedByMvu = false;
    let lastFocus = null, dialogCallback = null, fishFrame = 0;
    const subscriptions = [];
    const detailStates = new Map();
    const view = {plot:0,pen:0,recipe:RECIPES[0].name,bag:null,achievement:null,achievementFilter:'all',achievementPage:0};
    let navDrag=null, navSuppressClick=false, navClickTimer=0, lastNavTab=null, navObserver=null;
    const failedArt=new Map();
    const sessionOwner=uid();
    let liveFish=null,fishHeld=false,fishPaused=false,fishSaving=false,fishLanding=false,fishLastFrame=0,fishAccumulator=0,fishDom={};
    const host = doc.createElement('div'); host.id = 'jmzq-garden';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147482000;pointer-events:none;';
    const root = host.attachShadow({mode:'open'});
    const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const e = escape;
    const money = value => Math.floor(value).toLocaleString('zh-CN');
    const time = end => {
      const seconds = Math.max(0,Math.ceil((end-Date.now())/1000));
      return seconds ? (Math.floor(seconds/60) ? Math.floor(seconds/60)+'分' : '') + seconds%60+'秒' : '已完成';
    };
    root.innerHTML = '<style>' + styles() + '</style><div class="garden dark">' +
      '<button class="bubble" title="打开小农场" aria-label="打开小农场">🌾<span>小院</span></button>' +
      '<section class="panel" hidden aria-label="小农场"><header><div class="brand"><span class="mark">畦</span><div><h1>小农场</h1><small>秋日小院 / ' + VERSION + '</small></div></div>' +
      '<div class="wallet"><span>小院币 <b id="coins">—</b></span><span>行动力 <b id="energy">—</b></span></div>' +
      '<div class="header-actions"><button data-ui="theme" title="切换亮暗风格" aria-label="切换亮暗风格">☼</button><button data-ui="close" title="收起小院" aria-label="收起小院">×</button></div></header>' +
      '<div class="workspace"><div class="nav-shell"><button class="nav-arrow" data-ui="nav-prev" aria-label="向左滚动导航">‹</button><nav aria-label="小院功能"></nav><button class="nav-arrow" data-ui="nav-next" aria-label="向右滚动导航">›</button></div><main tabindex="-1"><div class="loading">正在打开小院存档…</div></main></div>' +
      '<footer><span id="connection">本地经营 · 实体物资可装入角色背包</span><span>v' + VERSION + '</span></footer>' +
      '<dialog aria-label="小农场操作"><div class="dialog-head"><h2></h2><button data-ui="dismiss" aria-label="关闭弹窗">×</button></div><div class="dialog-content"></div><p class="dialog-error" role="alert" hidden></p><div class="dialog-actions"></div></dialog></section>' +
      '<div class="toast" role="status" aria-live="polite" hidden></div></div>';
    doc.body.appendChild(host);
    const $ = q => root.querySelector(q);
    const panel = $('.panel'), main = $('main'), dialog = $('dialog');
    const navItems = [['overview','01','小院'],['farm','02','田地'],['ranch','03','牧场'],['fish','04','垂钓'],['explore','05','探索'],['workshop','06','工坊'],['journal','07','手账'],['achievements','08','成就'],['idle','09','值守'],['bag','10','仓库']];
    $('nav').innerHTML = navItems.map(([key,icon,title])=>'<button data-tab="'+key+'"><span>'+icon+'</span>'+title+(key==='achievements'?'<b class="nav-count" hidden></b>':'')+'<i>›</i></button>').join('');
    // Navigation never gets rebuilt with the page; dragging must not change selection.
    const nav=$('nav');
    function updateNavEdges(){
      const max=Math.max(0,nav.scrollWidth-nav.clientWidth);
      $('[data-ui="nav-prev"]').disabled=nav.scrollLeft<=1;
      $('[data-ui="nav-next"]').disabled=nav.scrollLeft>=max-1;
    }
    function revealActiveTab(){
      const active=$('nav .active');if(!active)return;
      const ar=active.getBoundingClientRect(),nr=nav.getBoundingClientRect();
      if(ar.left<nr.left)nav.scrollLeft-=nr.left-ar.left+6;
      else if(ar.right>nr.right)nav.scrollLeft+=ar.right-nr.right+6;
      updateNavEdges();
    }
    nav.addEventListener('pointerdown',event=>{
      // Touch uses native inertial pan-x. Mouse/pen use explicit drag with a click threshold.
      if(event.pointerType==='touch'||event.button!==0)return;
      navDrag={id:event.pointerId,start:event.clientX,left:nav.scrollLeft,moved:false};
    });
    nav.addEventListener('pointermove',event=>{
      if(!navDrag||event.pointerId!==navDrag.id)return;
      const delta=event.clientX-navDrag.start;
      if(!navDrag.moved&&Math.abs(delta)>5){
        navDrag.moved=true;navSuppressClick=true;
        nav.setPointerCapture?.(event.pointerId);nav.classList.add('dragging');
      }
      if(navDrag.moved){event.preventDefault();nav.scrollLeft=navDrag.left-delta;updateNavEdges();}
    });
    function endNavDrag(event){
      if(!navDrag||event.pointerId!==navDrag.id)return;
      const dragged=navDrag.moved;navDrag=null;nav.classList.remove('dragging');
      if(nav.hasPointerCapture?.(event.pointerId))nav.releasePointerCapture(event.pointerId);
      if(dragged){clearTimeout(navClickTimer);navClickTimer=setTimeout(()=>{navSuppressClick=false;},350);}
    }
    nav.addEventListener('pointerup',endNavDrag);nav.addEventListener('pointercancel',endNavDrag);
    nav.addEventListener('lostpointercapture',endNavDrag);
    nav.addEventListener('pointerleave',event=>{if(navDrag&&!navDrag.moved)endNavDrag(event);});
    nav.addEventListener('click',event=>{
      if(navSuppressClick){event.preventDefault();event.stopPropagation();navSuppressClick=false;}
    },true);
    nav.addEventListener('wheel',event=>{
      if(event.ctrlKey||nav.scrollWidth<=nav.clientWidth)return;
      const delta=Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY;
      if(!delta)return;event.preventDefault();
      nav.scrollLeft+=delta*(event.deltaMode===1?18:event.deltaMode===2?nav.clientWidth:1);
      updateNavEdges();
    },{passive:false});
    nav.addEventListener('scroll',updateNavEdges,{passive:true});
    nav.addEventListener('keydown',event=>{
      const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
      const buttons=[...nav.querySelectorAll('button')],index=buttons.indexOf(root.activeElement);
      if(index<0)return;event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:clamp(index+(event.key==='ArrowRight'?1:-1),0,buttons.length-1);
      buttons[next].focus({preventScroll:true});buttons[next].click();
    });
    function resize() { host.style.setProperty('--vh',(p.visualViewport?.height || p.innerHeight)+'px'); updateNavEdges(); }
    if(typeof p.ResizeObserver==='function'){navObserver=new p.ResizeObserver(updateNavEdges);navObserver.observe(nav);}
    // Failed image providers are skipped on subsequent renders; a full outage leaves usable text controls.
    root.addEventListener('error',event=>{
      const img=event.target;if(!img?.dataset?.asset)return;
      const name=img.dataset.asset,next=Number(img.dataset.provider||0)+1;
      failedArt.set(name,next);
      if(next<artBases.length){img.dataset.provider=String(next);img.src=artBases[next]+name+'.webp';}
      else {img.removeAttribute('src');img.hidden=true;(img.closest('.scene-tile,.sprite,.medal,.map-art')||img.parentElement).classList.add('asset-missing');}
    },true);
    resize(); p.addEventListener('resize',resize); p.visualViewport?.addEventListener('resize',resize);
    function cleanup() {
      alive = false; clearInterval(interval); clearTimeout(navClickTimer);navObserver?.disconnect();p.cancelAnimationFrame(fishFrame);
      p.removeEventListener('resize',resize); p.visualViewport?.removeEventListener('resize',resize);
      subscriptions.forEach(([em,name,fn])=>em.removeListener?.(name,fn));
      clearTimeout(toast.timer); if(dialog.open) dialog.close(); host.remove();
      if(db) db.close();
      if(p._farmCleanup === cleanup) delete p._farmCleanup;
      if(window._farmCleanup === cleanup) delete window._farmCleanup;
      window.removeEventListener('pagehide',cleanup);
      p.removeEventListener('blur',releaseFish);doc.removeEventListener('pointerup',releaseFish);doc.removeEventListener('pointercancel',releaseFish);
      doc.removeEventListener('keydown',fishKeyDown);doc.removeEventListener('keyup',fishKeyUp);doc.removeEventListener('visibilitychange',visibilityFish);
    }
    p._farmCleanup = window._farmCleanup = cleanup;
    window.addEventListener('pagehide',cleanup);
    const ctx = () => p.SillyTavern?.getContext?.() || window.SillyTavern?.getContext?.();
    function attachEvents() {
      const context = ctx(), emitter = context?.eventSource, types = context?.eventTypes || {};
      if(!emitter?.on || subscriptions.length) return;
      const listen = (name,fn) => { emitter.on(name,fn); subscriptions.push([emitter,name,fn]); };
      listen(types.GENERATION_STARTED || 'generation_started',()=>{blockedByGeneration=true;});
      listen(types.GENERATION_ENDED || 'generation_ended',()=>{blockedByGeneration=false;});
      listen(types.GENERATION_STOPPED || 'generation_stopped',()=>{blockedByGeneration=false;blockedByMvu=false;});
      listen('mag_variable_update_started',()=>{blockedByMvu=true;});
      listen('mag_variable_update_ended',()=>{blockedByMvu=false;});
      listen(types.CHAT_CHANGED || 'chat_id_changed',()=>{blockedByGeneration=false;blockedByMvu=false;});
    }
    function stopVisible() {
      const stop = doc.querySelector('#mes_stop');
      return !!stop && stop.getClientRects().length > 0 && p.getComputedStyle(stop).visibility !== 'hidden';
    }
    function apiForBackpack() {
      const api = p.TavernHelper;
      requireThat(api && typeof api.getVariables === 'function' && typeof api.updateVariablesWith === 'function','酒馆助手背包接口尚未就绪。物资仍在小院中，可稍后重试。');
      return api;
    }
    function targetNow() {
      requireThat(!blockedByGeneration && !blockedByMvu && !stopVisible(),'正文或变量仍在生成，结束后再装入背包');
      requireThat(!(p.Mvu || window.Mvu)?.isDuringExtraAnalysis?.(),'额外模型仍在解析变量，完成后再装箱');
      const context = ctx(), messages = context?.chat;
      requireThat(Array.isArray(messages) && messages.length,'请先打开角色聊天');
      const messageId = messages.length-1, message = messages[messageId];
      requireThat(message && !message.is_user && !message.is_system,'请等本轮正文与变量更新完成');
      const chatId = context.getCurrentChatId?.() || context.chatId;
      requireThat(typeof chatId === 'string' && chatId.length,'当前聊天身份尚未就绪');
      const api = apiForBackpack(), variables = api.getVariables({type:'message',message_id:messageId});
      requireThat(!variables?.then,'请更新酒馆助手后使用背包转入；本地经营仍可使用');
      requireThat(obj(variables?.stat_data?.物品),'当前楼层尚未生成背包变量，不会写入旧楼层');
      const name = variables.stat_data?.姓名 || context.name1 || '当前角色';
      const scope = String(context.characterId ?? '') + ':' + chatId;
      return {scope,messageId,swipe:message.swipe_id || 0,textHash:hash(message.mes || message.message || ''),label:String(name)+' · '+chatId,variables};
    }
    function sameTarget(a,b) { return a.scope===b.scope && a.messageId===b.messageId && a.swipe===b.swipe && a.textHash===b.textHash; }
    // 收据可在原楼层读取，不要求它仍是最新一层；正文被后续导演标签补写也不影响核对。
    function transferReceipt(pending) {
      const context=ctx(), chatId=context?.getCurrentChatId?.() || context?.chatId;
      requireThat(String(context?.characterId ?? '')+':'+chatId===pending.target.scope,'请返回装箱时的原聊天再核对');
      const message=context.chat?.[pending.target.messageId];
      requireThat(message && (message.swipe_id || 0)===pending.target.swipe,'请切回装箱时的原楼层分支再核对');
      const variables=apiForBackpack().getVariables({type:'message',message_id:pending.target.messageId});
      requireThat(!variables?.then,'背包接口不支持同步核对');
      return own(variables?.[RECEIPTS],pending.id);
    }
    function setConnection() {
      try { const target = targetNow(); $('#connection').textContent = (preview ? '预览模拟背包 · ' : '背包已连接 · ') + target.label; }
      catch { $('#connection').textContent = (preview ? '预览模式 · ' : '') + '本地经营 · 装箱时连接角色背包'; }
    }
    function toast(text,error = false) {
      if(error && dialog.open) { $('.dialog-error').textContent=text; $('.dialog-error').hidden=false; }
      const el = $('.toast'); el.textContent = text; el.classList.toggle('error',error); el.hidden = false;
      clearTimeout(toast.timer); toast.timer = setTimeout(()=>{el.hidden=true;},4500);
    }
    function showPanel() { panel.hidden = false; $('.bubble').hidden = true; if(state) {render(false);if(state.idle?.enabled)mutate(()=>null,false);} main.focus({preventScroll:true}); }
    function hidePanel() { dismiss(); releaseFish();fishPaused=!!liveFish;flushFish();panel.hidden = true; $('.bubble').hidden = false; p.cancelAnimationFrame(fishFrame); }
    function dismiss() { if(dialog.open) dialog.close(); dialogCallback = null; lastFocus?.focus?.({preventScroll:true}); }
    function modal(title,body,buttons,callback) {
      lastFocus = root.activeElement;
      $('.dialog-head h2').textContent = title;
      $('.dialog-content').innerHTML = body;
      $('.dialog-error').hidden=true;
      $('.dialog-actions').innerHTML = buttons.map(([id,title,primary])=>'<button class="'+(primary ? 'primary' : '')+'" data-modal="'+id+'">'+e(title)+'</button>').join('');
      dialogCallback = callback;
      if(!dialog.open) dialog.showModal();
    }
    dialog.addEventListener('cancel',()=>{dialogCallback=null;});
    root.addEventListener('click',async event=>{
      const button = event.target.closest('button');
      if(!button || button.disabled) return;
      if(button.classList.contains('bubble')) { showPanel(); return; }
      if(button.dataset.ui === 'close') { hidePanel(); return; }
      if(button.dataset.ui === 'dismiss') { dismiss(); return; }
      if(button.dataset.ui==='nav-prev'||button.dataset.ui==='nav-next'){
        nav.scrollLeft+=(button.dataset.ui==='nav-next'?1:-1)*Math.max(100,nav.clientWidth*.72);updateNavEdges();return;
      }
      if(button.dataset.tab) { releaseFish();flushFish();if(tab==='fish')fishPaused=!!liveFish;tab=button.dataset.tab; render(false); return; }
      if(button.dataset.ui === 'theme') { await mutate(s=>{s.theme=s.theme==='dark'?'light':'dark';return '已切换风格';},false); return; }
      if(button.dataset.modal) {
        if(button.dataset.modal === 'cancel') dismiss();
        else if(dialogCallback) {
          button.disabled=true;
          try { await dialogCallback(button.dataset.modal,button); }
          catch(error) { toast(error.message,true); }
          finally { if(button.isConnected) button.disabled=false; }
        }
        return;
      }
      if(button.dataset.do) handle(button).catch(error=>toast(error.message,true));
    });
    // IndexedDB 的一个 readwrite 事务同时读取最新状态并提交；多窗口点击不会用旧副本覆盖。
    async function openDatabase() {
      return new Promise((resolve,reject)=>{
        const req = indexedDB.open('ZodFarmDB',1);
        req.onupgradeneeded = ()=>{if(!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state',{keyPath:'key'});};
        req.onsuccess = ()=>resolve(req.result);
        req.onerror = ()=>reject(req.error);
        req.onblocked = ()=>reject(new Error('存档正被旧页面占用，请关闭旧版小农场后重试'));
      });
    }
    function readKey(key) {
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readonly'), req=tx.objectStore('state').get(key);
        req.onsuccess=()=>resolve(req.result?.value); req.onerror=()=>reject(req.error);
      });
    }
    async function transact(fn) {
      requireThat(alive,'小院已关闭，请重新打开');
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readwrite'), store=tx.objectStore('state'), req=store.get(stateKey);
        let value, result, failure;
        req.onsuccess=()=>{
          try {
            requireThat(alive,'小院实例已更新');
            value=clone(req.result?.value || state);
            requireThat(value?.version===4,'存档版本不兼容，请保留存档并更新脚本');
            tick(value);
            if(liveFish && value.fishing?.id===liveFish.id && value.fishing?.owner===sessionOwner) {value.fishing=clone(liveFish);value.fishing.lastActiveAt=Date.now();}
            settleIdle(value);
            result=fn(value);
            requireThat(!result?.then,'存档事务不能执行异步操作');
            value.revision=int(value.revision,Number.MAX_SAFE_INTEGER)+1;
            store.put({key:stateKey,value});
          } catch(error) { failure=error;tx.abort(); }
        };
        tx.oncomplete=()=>{state=value;resolve(result);};
        tx.onabort=()=>reject(failure || tx.error || new Error('存档写入失败，本次操作未生效'));
        tx.onerror=()=>{failure=failure || tx.error;};
      });
    }
    async function mutate(fn,notify = true) {
      if(busy) return;
      busy=true;
      try { const text=await transact(fn); if(alive) { render(); if(notify && text) toast(text); } return true; }
      catch(error) { toast(error.message || '存档写入失败',true); return false; }
      finally {busy=false;}
    }
    try {
      db=await openDatabase();
      if(!alive){db.close();return;}
      let saved=await readKey(stateKey);
      if(!saved) {
        const config=preview ? {} : await readKey('farm_config') || {};
        const suffix=config.selectedShelter || '本地庄园';
        const legacy=preview ? {} : {
          config,farm:await readKey('farm_state_本地庄园') || await readKey('farm_state_'+suffix),
          ranch:await readKey('ranch_state_本地庄园') || await readKey('ranch_state_'+suffix),
          fish:await readKey('fish_state'),meta:await readKey('minigame_meta'),
        };
        state=migrate(legacy);
        if(preview) {
          const now=Date.now();
          state.coins=560;state.level=4;
          ['土豆','白菜','草莓','豆类'].forEach((name,i)=>{
            action(state,'plant',{name,index:i},now);
            if(i<2) state.plots[i].readyAt=now-1000;
          });
          action(state,'buy-animal',{name:'鸡',index:0},now);state.pens[0].readyAt=now-1000;
          ['木材','布料','净水','土豆','小麦','药草','鲫鱼'].forEach(name=>add(state,name,5));
        }
        await new Promise((resolve,reject)=>{
          const tx=db.transaction('state','readwrite'), store=tx.objectStore('state'), request=store.get(stateKey);
          request.onsuccess=()=>{ if(!request.result) { store.put({key:stateKey,value:state}); if(!preview) store.put({key:'garden_v4_legacy_archive',value:legacy}); } };
          tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
        });
        saved=await readKey(stateKey);
      }
      requireThat(saved?.version===4,'存档版本不兼容，请勿重置原存档');
      state=saved; attachEvents(); render(); setConnection();
      if(preview) showPanel();
    } catch(error) {
      if(!alive)return;
      state=null;
      main.innerHTML='<div class="empty"><h2>小院暂时没能打开</h2><p>'+e(error.message)+'</p><p>原存档仍保留。关闭旧页面或恢复存储权限后，重新运行脚本即可。</p></div>';
      showPanel(); return;
    }
    function countReady() { return state.plots.filter(x=>ready(x,Date.now())).length; }
    function stat(label,value,detail='') { return '<div class="stat"><small>'+e(label)+'</small><strong>'+e(value)+'</strong><span>'+e(detail)+'</span></div>'; }
    function button(actionName,text,data='',disabled=false,primary=false) { return '<button data-do="'+actionName+'" '+data+' '+(disabled?'disabled':'')+' class="'+(primary?'primary':'')+'">'+text+'</button>'; }
    function heading(title,subtitle,aside='') { return '<div class="heading"><div><h2>'+title+'</h2><p>'+subtitle+'</p></div>'+aside+'</div>'; }
    function section(title,body) { return '<section class="card"><div class="section-title"><h3>'+title+'</h3></div>'+body+'</section>'; }
    function progress(value) { return '<div class="progress"><i style="width:'+clamp(value,0,100)+'%"></i></div>'; }
    function countdown(end) { return '<span data-until="'+end+'">'+time(end)+'</span>'; }
    function render(preserve = true) {
      if(!state || !alive) return;
      const scroll=preserve ? main.scrollTop : 0;
      const focused=root.activeElement?.closest?.('[data-do],[data-tab]');
      const focusKey=focused&&main.contains(focused)?{do:focused.dataset.do,index:focused.dataset.index,id:focused.dataset.id,name:focused.dataset.name}:null;
      root.querySelectorAll('main details').forEach(x=>detailStates.set(x.dataset.detail,x.open));
      $('.garden').className='garden '+(state.theme==='light'?'light':'dark');
      root.querySelectorAll('[data-tab]').forEach(btn=>{btn.classList.toggle('active',btn.dataset.tab===tab);btn.setAttribute('aria-current',btn.dataset.tab===tab?'page':'false');});
      tick(state);
      const readyGoals=MILESTONES.filter(g=>milestoneStatus(state,g).ready).length;
      const achievementCount=$('.nav-count');achievementCount.hidden=!readyGoals;achievementCount.textContent=readyGoals;achievementCount.setAttribute('aria-label',readyGoals+'项奖励待领取');
      $('#coins').textContent=money(state.coins);$('#energy').textContent=state.energy+'/'+(10+state.upgrades.tools);
      if(!state.fishing)liveFish=null;
      else if(liveFish?.id!==state.fishing.id || liveFish.owner!==state.fishing.owner)liveFish=clone(state.fishing);
      else if(state.fishing.phase==='fight' && liveFish.phase==='waiting')liveFish=clone(state.fishing);
      const renderers={overview:overviewPage,farm:farmPage,ranch:ranchPage,fish:fishPage,explore:explorePage,workshop:workshopPage,journal:journalPage,achievements:achievementsPage,idle:idlePage,bag:bagPage};
      main.dataset.page=tab;
      main.innerHTML=renderers[tab]();
      main.querySelectorAll('details').forEach(x=>{if(detailStates.has(x.dataset.detail))x.open=detailStates.get(x.dataset.detail);});
      main.scrollTop=scroll;
      fishDom={bar:$('#fish-player'),fish:$('#fish-target'),progress:$('#fish-progress'),percent:$('#fish-percent'),status:$('#fish-status'),chest:$('#fish-chest'),chestProgress:$('#chest-progress')};
      lastReady=readySignature(); p.cancelAnimationFrame(fishFrame);
      releaseFish();fishLastFrame=0;
      if(tab==='fish' && state.fishing && !panel.hidden) animateFish();
      if(lastNavTab!==tab){lastNavTab=tab;revealActiveTab();}else updateNavEdges();
      if(focusKey&&preserve){
        const match=[...main.querySelectorAll('[data-do]')].find(x=>Object.entries(focusKey).every(([key,value])=>x.dataset[key]===value));
        match?.focus({preventScroll:true});
      }
    }
    function artImage(name,alt='',lazy=true){
      const provider=failedArt.get(name)||0,missing=provider>=artBases.length;
      return '<img data-asset="'+name+'" data-provider="'+provider+'" '+(missing?'hidden':'src="'+e(artBases[provider]+name+'.webp')+'"')+' alt="'+e(alt)+'" decoding="async" '+(lazy?'loading="lazy"':'fetchpriority="high"')+' draggable="false">';
    }
    function sprite(name,extra=''){
      let index=CROPS.findIndex(c=>c.name===name);
      if(index<0){const animal=ANIMALS.findIndex(a=>a.name===name);if(animal>=0)index=12+animal;}
      if(index<0)index=({'空地':21,'幼苗':22,'饲槽':23})[name]??-1;
      if(index<0)return '<span class="item-symbol '+extra+'" aria-hidden="true">'+e(ITEMS[name]?.icon||'◇')+'</span>';
      // Generated artwork is not guaranteed to align to a mathematical grid.
      // Verified 256px sample windows in sprites-v2: each contains one complete subject only.
      const sourceY=[24,256,488,728][Math.floor(index/6)];
      return '<span class="sprite '+extra+'" style="--sx:'+index%6+';--sy:'+sourceY/256+'" aria-hidden="true">'+artImage('sprites-v2')+'</span>';
    }
    function scene(index,extra=''){
      return '<div class="scene-tile '+extra+'" style="--sx:'+index%2+';--sy:'+Math.floor(index/2)+'" aria-hidden="true"><div class="scene-viewport"><div class="scene-art">'+artImage('scenes')+'</div></div></div>';
    }
    function overviewPage() {
      const sky=weather(state), mature=countReady(), stock=state.bag.reduce((sum,x)=>sum+x.count,0);
      const tasks=state.daily.map(t=>'<article class="task"><div><h4>'+e(t.name)+'</h4><p>'+t.progress+'/'+t.target+' · '+t.reward+' 币</p>'+progress(t.progress/t.target*100)+'</div>'+button('daily',t.claimed?'已领':'领取','data-id="'+t.id+'"',t.claimed||t.progress<t.target,true)+'</article>').join('');
      const orders=state.orders.map(o=>'<article class="task"><div><h4>'+e(o.name)+'</h4><p>'+Object.entries(o.needs).map(([n,c])=>e(n)+' '+available(state,n)+'/'+c).join(' · ')+'</p><small>回报 '+o.reward+' 币</small></div>'+button('order',o.done?'已交':'交付','data-id="'+o.id+'"',o.done||Object.entries(o.needs).some(([n,c])=>available(state,n)<c))+'</article>').join('');
      const upgrades=Object.entries(UPGRADES).map(([key,c])=>'<article class="upgrade"><div><h4>'+c.icon+' '+c.name+' <small>'+state.upgrades[key]+'/'+c.max+'</small></h4><p>'+c.desc+'</p></div>'+button('upgrade',state.upgrades[key]>=c.max?'满级':money(c.base*(state.upgrades[key]+1))+' 币','data-key="'+key+'"',state.upgrades[key]>=c.max||state.coins<c.base*(state.upgrades[key]+1))+'</article>').join('');
      const pins=[['idle','值守',26,35,state.idle.enabled?'照看中':'小屋'],['explore','探索',58,15,state.expedition?'在路上':'出发'],['workshop','工坊',79,37,state.workshop.length+'/3'],['farm','田地',23,70,mature?'待收 '+mature:'12 畦'],['ranch','牧场',53,67,state.pens.filter(Boolean).length+'/6'],['fish','垂钓',84,79,state.fishing?'一竿未完':'抛一竿']];
      return '<div class="overview-heading"><div><span class="eyebrow">AUTUMN HOMESTEAD / '+state.day+'</span><h2>在废土之外，留一方小院。</h2></div><span class="weather-tag">'+sky.icon+' '+sky.name+' · Lv.'+state.level+'</span></div>'+
        '<div class="overview-grid"><section class="homestead"><div class="map-art">'+artImage('homestead','秋日小院全景，点击场景标签前往各区域',false)+pins.map(([key,label,x,y,status])=>'<button class="map-pin" data-tab="'+key+'" style="left:'+x+'%;top:'+y+'%" aria-label="前往'+label+'"><b>'+label+'</b><small>'+status+'</small></button>').join('')+'</div><div class="map-caption"><span>'+sky.desc+'</span><small>点击场景标签进入</small></div><div class="stats compact-stats">'+stat('可采收',mature,'12 块土地')+stat('仓库存量',stock+' 份',state.bag.length+' 类物资')+stat('收集图鉴',Object.keys(state.collection).length+' 种',state.xp+'/'+state.level*60+' 经验')+'</div></section>'+
        '<aside class="overview-side">'+section('今日小目标',tasks)+section('邻里订单',orders)+'</aside></div>'+
        (preview?'<details class="preview-tools" data-detail="preview-tools"><summary>预览工具 <small>不影响正式存档</small></summary>'+button('demo-supplies','领取预览体验包')+'</details>':'')+
        '<details class="card" data-detail="upgrades"><summary>小院建设 <small>浇灌 · 畜牧 · 工具</small></summary><div class="upgrade-grid">'+upgrades+'</div></details>'+
        '<details class="card" data-detail="journal"><summary>经营手记 <small>最近 50 条</small></summary><div class="journal">'+state.log.map(l=>'<p><time>'+new Date(l.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+'</time>'+e(l.text)+'</p>').join('')+'</div></details>';
    }
    function farmPage() {
      view.plot=clamp(view.plot,0,state.plots.length-1);
      const tiles=state.plots.map((plot,i)=>{
        const mature=ready(plot,Date.now()), selected=i===view.plot;
        const percent=mature?100:plot.crop?clamp((Date.now()-plot.plantedAt)/Math.max(1,plot.readyAt-plot.plantedAt)*100,0,100):0;
        return '<button class="land-tile '+(mature?'ready ':'')+(selected?'selected':'')+'" data-do="select-plot" data-index="'+i+'" aria-pressed="'+selected+'" aria-label="土地'+(i+1)+'，'+(plot.crop||'空闲')+'，'+(mature?'可采收':plot.crop?'生长中':'可播种')+'"><span class="tile-index">'+String(i+1).padStart(2,'0')+'</span>'+(mature?'<span class="tile-ready">✓</span>':'')+sprite(!plot.crop?'空地':percent<25?'幼苗':plot.crop)+'<b>'+e(plot.crop||'待播种')+'</b><small>'+(mature?'可以采收':plot.crop?countdown(plot.readyAt):'空闲土地')+'</small>'+progress(percent)+'</button>';
      }).join('');
      const index=view.plot, plot=state.plots[index],mature=ready(plot,Date.now());
      const percent=mature?100:plot.crop?clamp((Date.now()-plot.plantedAt)/Math.max(1,plot.readyAt-plot.plantedAt)*100,0,100):0;
      const copy=plot.crop?
        '<div class="selection-title">'+sprite(plot.crop)+'<div><span class="eyebrow">畦 '+String(index+1).padStart(2,'0')+' / '+(mature?'READY':'GROWING')+'</span><h3>'+plot.crop+'</h3><p>'+(mature?'成熟了，收进仓库吧。':countdown(plot.readyAt)+' 后可收')+'</p></div></div>'+
        '<div class="selection-tags"><span>'+(plot.watered?'已浇水':'待浇水')+'</span><span>'+(plot.tended?'精心照料':'自然生长')+'</span><span>'+(plot.rotation?'轮作 +1 产量':'常规种植')+'</span></div>'+progress(percent)+
        (plot.trouble?'<div class="trouble-row"><span class="warning">'+plot.trouble+' · 未处理少收1份</span>'+button('clear-trouble','处理 · 2 币','data-index="'+index+'"')+'</div>':'')+
        '<div class="actions">'+button(mature?'harvest':'care',mature?'采收':!plot.watered?'浇水':!plot.tended?'照料 · 4 币':'已照料','data-index="'+index+'"',!mature&&plot.watered&&plot.tended,true)+'</div>':
        '<div class="selection-title">'+sprite('空地')+'<div><span class="eyebrow">畦 '+String(index+1).padStart(2,'0')+' / EMPTY</span><h3>种下新一季</h3><p>'+(plot.lastFamily?'上茬 '+plot.lastFamily+'，试试换科轮作。':'挑一包种子，等它慢慢长大。')+'</p></div></div><div class="actions">'+button('seed','选择种子','data-index="'+index+'"',false,true)+'</div>';
      return heading('田地','点选地块，统一照料。成熟不腐烂，离线也生长。',button('harvest-all','全部采收','',!countReady(),true))+
        '<div class="management-layout"><section class="field-board"><div class="board-legend"><span><i class="dot ready"></i>可收 '+countReady()+'</span><span>生长 '+state.plots.filter(x=>x.crop&&!ready(x,Date.now())).length+'</span><span>空闲 '+state.plots.filter(x=>!x.crop).length+'</span></div><div class="land-grid">'+tiles+'</div></section><section class="selection-panel" aria-label="选中土地的操作">'+copy+'</section></div>'+
        '<details class="compact-help" data-detail="farm-help"><summary>种植小诀窍</summary><p>换科轮作：生长快10%、产量 +1。浇水缩短等待，照料再多收一份。小院天气不改写正文天气。</p></details>';
    }
    function ranchPage() {
      view.pen=clamp(view.pen,0,state.pens.length-1);
      const tiles=state.pens.map((pen,i)=>{
        const mature=pen&&Date.now()>=pen.readyAt,selected=i===view.pen;
        return '<button class="land-tile pen-tile '+(selected?'selected ':'')+(mature?'ready':'')+'" data-do="select-pen" data-index="'+i+'" aria-pressed="'+selected+'" aria-label="围栏'+(i+1)+'，'+(pen?.name||'空闲')+'"><span class="tile-index">'+String(i+1).padStart(2,'0')+'</span>'+(mature?'<span class="tile-ready">✓</span>':'')+sprite(pen?.name||'饲槽')+'<b>'+e(pen?.name||'空围栏')+'</b><small>'+(pen?(mature?'已就绪':countdown(pen.readyAt)):'添一位住客')+'</small></button>';
      }).join('');
      const index=view.pen,pen=state.pens[index],animal=pen&&ANIMALS.find(a=>a.name===pen.name),mature=pen&&Date.now()>=pen.readyAt;
      const copy=pen?'<div class="selection-title">'+sprite(pen.name)+'<div><span class="eyebrow">围栏 '+String(index+1).padStart(2,'0')+'</span><h3>'+pen.name+'</h3><p>'+(mature?(animal.product?'可收取'+animal.product:'可以出栏'):countdown(pen.readyAt))+'</p></div></div><div class="selection-tags"><span>亲近 '+pen.affection+'/3</span><span>'+(pen.fed?'已喂食':'待喂食')+'</span></div><div class="actions">'+button('feed',pen.fed?'已喂食':'喂食 · 3 币','data-index="'+index+'"',pen.fed)+(animal.product?button('collect','收取'+animal.product,'data-index="'+index+'"',!mature,true):'')+'</div><div class="danger-zone">'+button('confirm-slaughter','出栏','data-index="'+index+'"',!mature)+'<small>转为肉类，需再次确认</small></div>':
        '<div class="selection-title">'+sprite('饲槽')+'<div><span class="eyebrow">围栏 '+String(index+1).padStart(2,'0')+'</span><h3>空着的围栏</h3><p>有六个位置，慢慢添新邻居。</p></div></div><div class="actions">'+button('adopt','挑选住客','data-index="'+index+'"',false,true)+'</div>';
      return heading('牧场','点选围栏。照料增加亲近度，收取产物不会让动物消失。')+
        '<div class="management-layout"><section class="field-board"><div class="board-legend"><span>住客 '+state.pens.filter(Boolean).length+'/6</span><span>可收 '+state.pens.filter(x=>x&&Date.now()>=x.readyAt).length+'</span></div><div class="pen-grid">'+tiles+'</div></section><section class="selection-panel" aria-label="选中围栏的操作">'+copy+'</section></div>';
    }
    function fishPage() {
      const session=liveFish || state.fishing,biting=session&&Date.now()>=session.biteAt,fighting=session?.phase==='fight',engine=session?.engine;
      const spot=SPOTS.find(x=>x.key===state.tackle.spot),rod=RODS.find(x=>x.key===state.tackle.rod),bait=BAITS.find(x=>x.key===state.tackle.bait);
      const controlled=session?.owner===sessionOwner,last=state.fishBook.last;
      const setup='<div class="tackle-strip">'+[['spot',spot.icon+' '+spot.name],['rod','🎣 '+rod.name],['bait','🪱 '+bait.name]].map(([kind,label])=>button('tackle-dialog',label+' ›','data-kind="'+kind+'"',!!session)).join('')+'</div>';
      let content;
      if(fighting) {
        const control=engine.result?button('land-fish','保存这次结果','',false,true):(!controlled||fishPaused?button('resume-fish','继续这一竿','',false,true):'<button class="hold-btn primary" data-hold="fish" aria-label="按住控制钓鱼条上浮">按住提竿 ↑<small>空格 / ↑ 键同样有效</small></button>');
        content='<section class="card fish-battle"><div class="fish-board"><div class="fish-lane" aria-label="纵向钓鱼轨道"><div class="fish-waterlines"></div><div id="fish-player" style="top:'+(engine.bar-engine.size/2)+'%;height:'+engine.size+'%"></div><span id="fish-target" style="top:'+engine.fish+'%">🐟</span>'+(engine.chest?'<span id="fish-chest" style="top:'+engine.chestAt+'%">📦</span>':'')+'</div><div class="fish-instructions"><span class="pill">'+(fishPaused||!controlled?'已暂停':'正在搏鱼')+'</span><h3>跟住鱼。</h3><p>按住上浮，松开下沉。<br>覆盖鱼影，积累进度。</p><strong id="fish-status">'+(fishPaused?'歇一会儿，鱼留在这里':engine.fishMode)+'</strong>'+control+'<div class="actions fish-secondary">'+(!fishPaused&&controlled&&!engine.result?button('pause-fish','暂停'):'')+button('cancel-fish','放弃')+'</div>'+(engine.chest?'<div class="chest-note">📦 停留1.3秒取箱，钓到鱼才带回<div class="progress"><i id="chest-progress" style="width:'+engine.chestProgress*100+'%"></i></div></div>':'')+'</div></div><div class="catch-meter"><span>捕获进度</span><b id="fish-percent">'+Math.round(engine.progress)+'%</b></div><div class="progress catch-progress"><i id="fish-progress" style="width:'+engine.progress+'%"></i></div></section>';
      } else content='<section class="pond card">'+scene(0,'pond-scene')+'<div class="pond-status"><span class="pill">'+(session?(biting?'鱼咬钩了！':'等待咬钩'):spot.name)+'</span><h3>'+(session?(biting?'提竿，让我们看看水下的家伙。':'浮标还安静地停在水面。'):'坐一会儿，下一条会是什么鱼？')+'</h3><p>'+e(spot.desc)+'</p>'+(session?'<p>咬钩窗口剩余 '+countdown(session.expiresAt)+'</p>':'')+'</div><div class="actions">'+(session?button('hook','提竿应战','',!biting,true)+button('cancel-fish','收好钓具'):button('cast','抛竿 · 1 行动力','',state.energy<1,true))+'</div></section>';
      const records='<div class="stats">'+stat('最重渔获',state.fishBook.heaviest?state.fishBook.heaviest.weight+' kg':'—',state.fishBook.heaviest?.name||'等你留下纪录')+stat('最长渔获',state.fishBook.longest?state.fishBook.longest.length+' cm':'—',state.fishBook.longest?.name||'每条鱼都有体型差异')+stat('完美 / 宝箱',state.fishBook.perfect+' / '+state.fishBook.chests,'宝箱也能开出工坊材料')+'</div>';
      return (fighting?'':heading('垂钓','按住上浮，松开下沉。跟住鱼，等它咬钩。')+setup)+content+
        (last?'<div class="note">上一竿：'+e(last.name)+' · '+last.weight+' kg · '+last.length+' cm'+(last.perfect?' · 完美控线':'')+'</div>':'')+records+
        '<details class="card" data-detail="fishbook"><summary>渔获图鉴 <small>11种鱼 · 不同水域与习性</small></summary><div class="collection">'+FISH.map(f=>'<div class="'+(state.collection[f.name]?'known':'unknown')+'"><span>'+f.icon+'</span><b>'+f.name+'</b><small>'+f.quality+' · '+FISH_HABITS[f.name]+'</small><small>'+(state.collection[f.name]?'已收集 '+state.collection[f.name]:'未发现')+'</small></div>').join('')+'</div></details>';
    }
    function explorePage() {
      const trip=state.expedition, zone=trip&&ZONES.find(z=>z.key===trip.zone);
      const event=trip?.encounter,enc=event&&ENCOUNTERS[event.index];
      const encounter=event&&!event.choice&&Date.now()>=event.at?'<section class="notice"><span class="eyebrow">途中遭遇 · 需要你做决定</span><h3>'+enc.name+'</h3><p>'+enc.text+'</p><div class="encounter-options">'+button('explore-choice','记下位置，安全绕行','data-choice="safe"')+button('explore-choice',enc.toolLabel+' · '+enc.tool+' ×'+enc.toolCount,'data-choice="tool"',available(state,enc.tool)<enc.toolCount,true)+button('explore-choice','冒险尝试 · 失败多走45秒','data-choice="risk"')+'</div><small>耗材处理额外带回3份物资；冒险成功带回4份，但有'+Math.round((enc.risk-state.talents.explore*.03)*100)+'%概率失败。</small></section>':'';
      return heading('旧路探索','选一条路线，带些物资回来。中途遭遇由你决定。')+
        (trip?section('进行中的路线','<div class="task"><div><h3>'+zone.icon+' '+zone.name+'</h3><p>'+STANCES[trip.stance].name+' · '+countdown(trip.readyAt)+'</p>'+(event&&!event.choice&&Date.now()<event.at?'<small>行至途中时可能有新发现 '+countdown(event.at)+'</small>':'')+'</div>'+button('claim-explore','领取收获','',Date.now()<trip.readyAt||!!(event&&!event.choice),true)+'</div>'):'')+encounter+
        '<div class="zone-grid">'+ZONES.map((z,i)=>'<article class="zone card">'+scene(i+1)+'<div class="zone-copy"><div class="row"><h3>'+z.name+'</h3><small>0'+(i+1)+'</small></div><p>'+z.items.slice(0,3).join(' · ')+'</p><div class="tags"><span>'+z.cost+' 行动力</span><span>'+z.minutes+' 分钟</span><span>风险 '+Math.round(z.risk*100)+'%</span></div>'+button('route',state.level<z.level?'Lv.'+z.level+' 开放':'选择路线','data-zone="'+z.key+'"',state.level<z.level||!!trip,true)+'</div></article>').join('')+'</div>'+
        '<div class="note">这些是小院探索记录，不会自动替主角移动、战斗或改写生命值。发现的实体材料可从仓库装箱。</div>';
    }
    function journalPage() {
      const points=talentPoints(state),project=PROJECTS[state.projects.length];
      const talents=Object.entries(TALENTS).map(([key,t])=>'<article class="upgrade"><div><h4>'+t.icon+' '+t.name+' '+state.talents[key]+'/3</h4><p>'+t.desc+'</p></div>'+button('talent','学习','data-key="'+key+'"',!points||state.talents[key]>=3,true)+'</article>').join('');
      const projectHtml=project?'<span class="eyebrow">第 '+(state.projects.length+1)+' / '+PROJECTS.length+' 期</span><h3>'+project.name+'</h3><p>'+project.desc+'</p><div class="ingredients">'+Object.entries(project.needs).map(([n,c])=>'<span class="'+(available(state,n)>=c?'enough':'')+'">'+n+' '+available(state,n)+'/'+c+'</span>').join('')+'</div><p>完成奖励：'+Object.entries(project.reward).map(([n,c])=>n+' ×'+c).join('、')+'，以及 '+project.coins+' 小院币。</p>'+button('project','交付这一期物资','data-id="'+project.id+'"',Object.entries(project.needs).some(([n,c])=>available(state,n)<c),true):'<h3>守望信号已经点亮。</h3><p>三期交付全部完成。继续经营，慢慢填满你的图鉴吧。</p>';
      return heading('小院手账','经营心得、长期交付与收集成就。每升3级，获得1点心得。')+
        section('经营心得 · 可用 '+points+' 点','<div class="upgrade-grid">'+talents+'</div>')+
        '<section class="card project-card">'+projectHtml+'</section>'+
        '<section class="card achievement-link"><div><h3>小院成就册 · '+MILESTONES.filter(g=>milestoneStatus(state,g).claimed).length+' / '+MILESTONES.length+'</h3><p>六类收藏徽章，每项成绩都有独立奖励。</p></div><button data-tab="achievements">翻开成就册 ›</button></section>'+section('路上的发现 · '+state.discoveries.length+' 处','<div class="tags">'+(state.discoveries.length?state.discoveries.map(n=>'<span>⌖ '+e(n)+'</span>').join(''):'<p>在探索途中做出选择，会逐渐记录新的地点。</p>')+'</div>');
    }
    function medal(index,extra='') {
      return '<span class="medal '+extra+'" style="--mx:'+index%3+';--my:'+Math.floor(index/3)+'" aria-hidden="true">'+artImage('medals')+'</span>';
    }
    function achievementsPage() {
      const ordered=ACHIEVEMENT_CATEGORIES.flatMap(c=>c.goals.map(id=>MILESTONES.find(g=>g.id===id)));
      const ready=ordered.filter(g=>milestoneStatus(state,g).ready).length,claimed=ordered.filter(g=>milestoneStatus(state,g).claimed).length;
      const filter=view.achievementFilter;
      const filtered=ordered.filter(g=>filter==='all'||(filter==='ready'?milestoneStatus(state,g).ready:g.category===filter));
      const pages=Math.max(1,Math.ceil(filtered.length/6));view.achievementPage=clamp(view.achievementPage,0,pages-1);
      const visible=filtered.slice(view.achievementPage*6,view.achievementPage*6+6);
      if(!visible.some(g=>g.id===view.achievement))view.achievement=visible.find(g=>milestoneStatus(state,g).ready)?.id||visible[0]?.id||null;
      const goal=visible.find(g=>g.id===view.achievement);
      const filters=[['all','全部',ordered.length],['ready','可领取',ready],...ACHIEVEMENT_CATEGORIES.map(c=>[c.id,c.name,c.goals.length])];
      const statusLabel=s=>s.claimed?'已领取':s.ready?'可领取':'进行中';
      const valueLabel=(g,s)=>Number(s.progress.toFixed(2))+' / '+g.target+(g.unit?' '+g.unit:'');
      const cards=visible.map(g=>{
        const s=milestoneStatus(state,g),selected=g.id===view.achievement;
        return '<button class="achievement-card '+(s.claimed?'claimed':s.ready?'ready':'')+' '+(selected?'selected':'')+'" data-do="select-achievement" data-id="'+g.id+'" aria-pressed="'+selected+'">'+medal(g.medal)+'<span class="achievement-copy"><span class="achievement-title"><b>'+g.name+'</b><small>'+statusLabel(s)+'</small></span><span class="achievement-goal">'+g.desc+'</span><span class="achievement-progress">'+valueLabel(g,s)+'</span>'+progress(s.progress/g.target*100)+'<span class="achievement-prize">'+g.coins+' 币 · '+Object.entries(g.items).map(([n,c])=>n+' ×'+c).join('、')+'</span></span></button>';
      }).join('');
      let detail='<aside class="card achievement-detail"><h3>这一页的奖励已收好</h3><p>切换分类，看看下一枚徽章。</p></aside>';
      if(goal){
        const s=milestoneStatus(state,goal),category=ACHIEVEMENT_CATEGORIES.find(c=>c.id===goal.category);
        const requirements=goal.id==='all_rounder'?'<div class="achievement-requirements">'+[['等级',state.level,8],['作物',state.stats.harvest,30],['畜牧',state.stats.ranch,30],['渔获',state.stats.fish,30]].map(([n,v,t])=>'<span>'+n+' '+Math.min(v,t)+'/'+t+'</span>').join('')+'</div>':'';
        detail='<aside class="card achievement-detail" data-achievement="'+goal.id+'"><div class="achievement-detail-head">'+medal(goal.medal,'medal-large')+'<div><small>'+category.name+'收藏 · '+String(goal.sequence).padStart(2,'0')+'</small><h3>'+goal.name+'</h3><span class="pill">'+statusLabel(s)+'</span></div></div><p>'+goal.desc+'</p>'+requirements+'<div class="achievement-detail-progress"><b>'+valueLabel(goal,s)+'</b>'+progress(s.progress/goal.target*100)+'</div><div class="achievement-rewards"><div><b>'+goal.coins+' 小院币</b><small>小院经营货币</small></div>'+Object.entries(goal.items).map(([name,count])=>'<div><b>'+name+' ×'+count+'</b><small>'+(ITEMS[name].transferable?'实体物资 · 可手动装箱':'经营补给 · 仅在小院使用')+'</small></div>').join('')+'</div>'+button('milestone',s.claimed?'奖励已领取':s.ready?'领取这项奖励':'达成目标后领取','data-id="'+goal.id+'"',!s.ready,true)+'</aside>';
      }
      return heading('小院成就册','每一点经营，都值得留下一枚纪念。')+'<div class="achievement-summary"><span><b>'+claimed+'</b> / '+ordered.length+' 已领取</span><span><b>'+ready+'</b> 项奖励待领取</span><small>旧版领奖记录已保留</small></div><div class="achievement-filters" aria-label="成就分类">'+filters.map(([id,name,count])=>'<button data-do="achievement-filter" data-id="'+id+'" class="'+(id===filter?'selected':'')+'" aria-pressed="'+(id===filter)+'">'+name+' <small>'+count+'</small></button>').join('')+'</div><div class="achievement-layout"><section class="achievement-browser"><div class="achievement-grid">'+(cards||'<div class="card"><h3>暂时没有待领奖励</h3><p>继续照料小院，新的成绩会自动记录。</p></div>')+'</div><div class="achievement-pagination">'+button('achievement-page','‹ 上一页','data-index="'+(view.achievementPage-1)+'"',!view.achievementPage)+'<span>'+(view.achievementPage+1)+' / '+pages+' 页</span>'+button('achievement-page','下一页 ›','data-index="'+(view.achievementPage+1)+'"',view.achievementPage>=pages-1)+'</div></section>'+detail+'</div><div class="note">每项奖励只能领取一次，先进入小院仓库；实体物资可到仓库手动装入角色背包。不会自动改动正文变量。</div>';
    }
    function idlePage() {
      const idle=state.idle,r=idle.lastReport;
      const intro=heading('离线值守','最长照看8小时，代收上限200份。亲自照料能提高品质与产量。');
      if(!idle.built)return intro+'<section class="card project-card">'+scene(5,'idle-art')+'<h3>搭一个值守岗</h3><p>值守会代收成熟作物、畜牧产物和已完工的加工品。也可以托付补种、喂食及售卖普通余粮。</p><p>建造：Lv.3 · 80 小院币 · 木材6 · 布料3</p>'+button('build-idle','建立值守岗','',state.level<3||state.coins<80||available(state,'木材')<6||available(state,'布料')<3,true)+'</section>';
      const checks=[['enabled','开启值守','关闭后只保留自然生长，不自动收获'],['autoPlant','代收后续种上一茬','仅续种已有品种；计入每日花费预算'],['autoFeed','定时添一份饲料','每次3币；只收产物，绝不自动出栏'],['sellSurplus','售卖普通余粮','仅普通食物与纤维/木材；保留指定份数，不卖稀有渔获或工具']];
      return intro+'<section class="card"><div class="section-title"><h3>'+ (idle.enabled?'值守进行中':'值守已暂停')+'</h3></div><div class="idle-settings">'+checks.map(([key,label,desc])=>'<label class="check-row"><input type="checkbox" data-idle="'+key+'" '+(idle[key]?'checked':'')+'><span><b>'+label+'</b><small>'+desc+'</small></span></label>').join('')+'<label class="field">每日花费预算<input id="idle-budget" type="number" min="0" max="1000" value="'+idle.budget+'">币</label><label class="field">每堆至少保留<input id="idle-keep" type="number" min="1" max="100" value="'+idle.keep+'">份</label></div><p>今日已花费 '+idle.spent+' / '+idle.budget+' 币。预算用完或金币不足，会停止补种与喂食，仍可代收。</p>'+button('save-idle','保存值守安排','',false,true)+'</section>'+
        (r?section('上次回来时','<div class="stats">'+stat('代收作物',r.harvest+' 份')+stat('畜牧产物',r.ranch+' 份')+stat('工坊完成',r.craft+' 件')+'</div><p class="idle-report">照看 '+r.minutes+' 分钟 · 补种 '+r.planted+' 块 · 花费 '+r.spent+' 币 · 售出 '+r.sold+' 份 / 收入 '+r.earned+' 币'+(r.capped?'。超过8小时的部分不重复结算。':'')+(r.full?' 仓库已接近代收上限，先整理一下。':'')+'</p>'):'')+
        '<div class="note">值守只处理小院库存，不会自动领取成就、决定探索事件、代替你钓鱼，或向剧情背包写入奖励。设置只在按下保存后生效。</div>';
    }
    function workshopPage() {
      const jobs=state.workshop.map(job=>'<article class="task"><div><h4>'+ITEMS[job.name].icon+' '+job.name+'</h4><p>'+countdown(job.readyAt)+'</p></div>'+button('claim-craft','收取','data-id="'+job.id+'"',Date.now()<job.readyAt,true)+'</article>').join('');
      const recipe=RECIPES.find(x=>x.name===view.recipe)||RECIPES[0],cfg=ITEMS[recipe.name];
      const enough=Object.entries(recipe.needs).every(([n,c])=>available(state,n)>=c);
      const list=RECIPES.map(r=>{
        const selected=r.name===recipe.name,can=state.level>=r.level&&Object.entries(r.needs).every(([n,c])=>available(state,n)>=c);
        return '<button class="recipe-option '+(selected?'selected':'')+'" data-do="select-recipe" data-name="'+e(r.name)+'" aria-pressed="'+selected+'">'+sprite(r.name)+'<span><b>'+r.name+'</b><small>'+(state.level<r.level?'Lv.'+r.level+' 开放':can?'材料齐全':'缺少材料')+' · '+r.minutes+'分</small></span>'+(can?'<i class="dot ready"></i>':'')+'</button>';
      }).join('');
      return '<div class="workshop-banner">'+scene(5)+heading('小院工坊','把收获变成食物、工具和下次冒险的补给。')+'</div>'+
        (jobs?section('制作队列 · '+state.workshop.length+'/3','<div class="job-strip">'+jobs+'</div>'):'')+
        '<div class="management-layout"><section class="recipe-list" aria-label="配方列表">'+list+'</section><section class="selection-panel recipe-detail"><div class="selection-title">'+sprite(recipe.name)+'<div><span class="eyebrow">RECIPE / '+recipe.minutes+' MIN</span><h3>'+recipe.name+'</h3><span class="pill">'+(cfg.transferable?'实体物资 · 可装箱':'小院经营增益')+'</span></div></div><p>'+cfg.detail+'</p><div class="ingredients">'+Object.entries(recipe.needs).map(([n,c])=>'<span class="'+(available(state,n)>=c?'enough':'')+'">'+e(n)+' '+available(state,n)+'/'+c+'</span>').join('')+'</div><div class="actions">'+button('craft',state.level<recipe.level?'Lv.'+recipe.level+' 开放':state.workshop.length>=3?'制作队列已满':'开始制作','data-name="'+e(recipe.name)+'"',!enough||state.level<recipe.level||state.workshop.length>=3,true)+'</div></section></div>';
    }
    function bagPage() {
      const pending=state.pending;
      const pendingHtml=pending?'<section class="notice"><h3>一箱物资待核对</h3><p>'+e(pending.name)+' ×'+pending.item.count+' · '+e(pending.target.label)+'</p><p>物资已预留。返回原聊天和原分支后核对，不会重复出售或装箱。</p>'+button('recover','核对装箱结果','',false,true)+'</section>':'';
      const stack=state.bag.find(x=>x.id===view.bag)||state.bag[0],cfg=stack&&ITEMS[stack.name];
      if(stack)view.bag=stack.id;
      const tiles=state.bag.map(item=>'<button class="stock-tile '+(item.id===stack?.id?'selected':'')+'" data-do="select-stack" data-id="'+item.id+'" aria-pressed="'+(item.id===stack?.id)+'" aria-label="'+e(item.name)+'，'+e(item.quality)+'，'+item.count+'份"><span class="stock-count">×'+item.count+'</span>'+sprite(item.name)+'<b>'+e(item.name)+'</b><small>'+e(item.quality)+'</small></button>').join('');
      const detail=stack?'<section class="selection-panel stock-detail"><div class="selection-title">'+sprite(stack.name)+'<div><span class="eyebrow">STORAGE / '+e(cfg?.category||'历史物品')+'</span><h3>'+e(stack.name)+' <span class="quantity">×'+stack.count+'</span></h3><p>'+e(stack.quality)+' · '+stack.weight+' kg/份</p></div></div><p>'+e(cfg?.detail||'旧版物品已保留，暂不外送。')+'</p><div class="actions">'+
        (cfg?.transferable?button('pack','装入角色背包','data-id="'+stack.id+'"',!!pending,true):cfg&&!cfg.transferable?button('use','在小院使用','data-id="'+stack.id+'"',false,true):'')+
        (cfg?.price?button('sell-dialog','出售','data-id="'+stack.id+'"'):'')+'</div><small>先选择数量，再确认。未选中的物资不会变动。</small></section>':'';
      return heading('仓库','点选物资后装箱或出售。实体奖励可转入当前角色背包。')+pendingHtml+
        (stack?'<div class="management-layout inventory-layout"><section class="stock-grid" aria-label="小院库存">'+tiles+'</section>'+detail+'</div>':'<section class="card empty"><h3>仓库还空着</h3><p>去种一畦菜，或试着抛出第一竿。</p>'+button('go-farm','去田地','',false,true)+'</section>')+
        '<details class="card" data-detail="deliveries"><summary>装箱记录 <small>'+state.deliveries.length+' 笔</small></summary><div class="journal">'+state.deliveries.map(x=>'<p><time>'+new Date(x.at).toLocaleDateString('zh-CN')+'</time><span>'+e(x.name)+' ×'+x.count+' → '+e(x.target)+'</span></p>').join('')+'</div></details>';
    }
    async function handle(btn) {
      if(busy) return;
      const type=btn.dataset.do;
      if(type==='select-plot'||type==='select-pen'){
        view[type==='select-plot'?'plot':'pen']=Number(btn.dataset.index);render();return;
      }
      if(type==='select-recipe'){view.recipe=btn.dataset.name;render();return;}
      if(type==='select-stack'){view.bag=btn.dataset.id;render();return;}
      if(type==='select-achievement'){view.achievement=btn.dataset.id;render();return;}
      if(type==='achievement-filter'){view.achievementFilter=btn.dataset.id;view.achievementPage=0;view.achievement=null;render();return;}
      if(type==='achievement-page'){view.achievementPage=Number(btn.dataset.index);view.achievement=null;render();return;}
      if(type==='demo-supplies' && preview) {await mutate(s=>{s.coins+=1200;s.level=Math.max(10,s.level);['木材','布料','废铁','净水','野果','香料','草药','电池','电子元件','白菜','小麦','鸡蛋'].forEach(n=>add(s,n,12));return '已发放预览体验包，不影响正式小院';});return;}
      if(type==='pause-fish') {fishPaused=true;releaseFish();await flushFish();render();return;}
      if(type==='resume-fish' || type==='hook') {
        if(await mutate(s=>action(s,type,{owner:sessionOwner}))) {fishPaused=false;liveFish=clone(state.fishing);render(false);}return;
      }
      if(type==='save-idle') {
        const config={budget:Number($('#idle-budget').value),keep:Number($('#idle-keep').value)};
        root.querySelectorAll('[data-idle]').forEach(x=>config[x.dataset.idle]=x.checked);
        await mutate(s=>action(s,'idle-config',config));return;
      }
      if(type==='tackle-dialog') {
        const kind=btn.dataset.kind,pool={rod:RODS,bait:BAITS,spot:SPOTS}[kind];
        modal({rod:'挑一支顺手的钓竿',bait:'鱼饵与诱鱼方式',spot:'今天去哪里钓？'}[kind],'<div class="picker">'+pool.map(item=>{
          const owned=kind==='spot' || (kind==='rod'?state.tackle.ownedRods:state.tackle.ownedBaits).includes(item.key);
          const locked=state.level<(item.level||1),selected=state.tackle[kind]===item.key;
          return '<button data-modal="'+item.key+'" '+(locked||(!owned&&state.coins<item.price)?'disabled':'')+' class="'+(selected?'selected':'')+'"><div><h3>'+item.name+'</h3><p>'+(kind==='rod'?'控制条长度 '+item.size+'%':item.desc)+'</p><small>'+(locked?'Lv.'+item.level+' 开放':selected?'当前选用':owned?'已拥有 · 免费切换':item.price+' 币 · 永久购入')+'</small></div><span>'+(selected?'✓':'›')+'</span></button>';
        }).join('')+'</div>',[['cancel','先这样']],async key=>{if(await mutate(s=>action(s,'tackle',{kind,key})))dismiss();});return;
      }
      if(type==='go-farm') {tab='farm';render(false);return;}
      if(type==='seed' || type==='adopt') {
        const index=Number(btn.dataset.index), crops=type==='seed', pool=crops?CROPS:ANIMALS;
        const body='<div class="picker">'+pool.map(c=>'<button data-modal="'+e(c.name)+'" '+(state.coins<c.cost||(crops&&state.level<c.level)?'disabled':'')+'>'+sprite(c.name)+'<div><h3>'+c.name+'</h3><p>'+c.cost+' 币 · '+c.minutes+' 分钟'+(crops?' · '+c.family+' · 产出 '+c.yieldCount:'')+'</p></div><span>＋</span></button>').join('')+'</div>';
        modal(crops?'这一畦，种些什么？':'选择围栏住客',body,[['cancel','暂时不选']],async name=>{
          if(await mutate(s=>action(s,crops?'plant':'buy-animal',{name,index}))) dismiss();
        }); return;
      }
      if(type==='route') {
        const zone=ZONES.find(z=>z.key===btn.dataset.zone);
        modal(zone.name+' · 选择路线','<p>深入搜索收获更多，但也更容易提前折返。失败仍会带回少量材料。</p><div class="picker">'+Object.entries(STANCES).map(([key,stance])=>'<button data-modal="'+key+'"><span class="item-icon">'+({careful:'🛡️',balanced:'🧭',bold:'⚡'}[key])+'</span><div><h3>'+stance.name+'</h3><p>'+Math.round(zone.minutes*stance.time*10)/10+' 分钟 · 风险 '+Math.round(clamp(zone.risk+stance.risk,0,.8)*100)+'% · 成功带回 '+stance.loot+' 份</p></div></button>').join('')+'</div>',[['cancel','留在小院']],async stance=>{
          if(await mutate(s=>action(s,'explore',{zone:zone.key,stance}))) dismiss();
        });return;
      }
      if(type==='confirm-slaughter') {
        const index=Number(btn.dataset.index), pen=state.pens[index];
        modal('确认出栏','<p>将这只'+e(pen.name)+'转为肉类物资，围栏会空出来。此操作不能撤销。</p>',[['cancel','继续饲养'],['confirm','确认出栏',true]],async()=>{if(await mutate(s=>action(s,'slaughter',{index})))dismiss();});return;
      }
      if(type==='pack' || type==='sell-dialog') {
        const stack=state.bag.find(x=>x.id===btn.dataset.id);
        requireThat(stack,'库存已变化，请重新选择');
        const pack=type==='pack', target=pack?targetNow():null;
        modal(pack?'装入角色背包':'出售物资','<div class="pack-title"><span class="item-icon">'+e(stack.icon)+'</span><div><h3>'+e(stack.name)+'</h3><p>'+e(stack.quality)+' · 库存 '+stack.count+' 份</p></div></div><label class="field">数量<input id="quantity" type="number" inputmode="numeric" min="1" max="'+stack.count+'" value="1"></label><p>'+e(pack?'目的地：'+target.label+'。本次只转入这件物品。':'每份基础售价 '+ITEMS[stack.name].price+' 小院币。小院币不会转为剧情货币。')+'</p>',
          [['cancel','取消'],['confirm',pack?'确认装箱':'确认出售',true]],async()=>{
            const count=Number($('#quantity').value);
            requireThat(Number.isSafeInteger(count)&&count>0&&count<=stack.count,'请填写有效的整数数量');
            if(pack) { await transfer(stack.id,count,target); dismiss(); }
            else if(await mutate(s=>action(s,'sell',{id:stack.id,count}))) dismiss();
          });return;
      }
      if(type==='recover') { await recoverTransfer();return; }
      const args={index:Number(btn.dataset.index),id:type==='land-fish'?state.fishing?.id:btn.dataset.id,name:btn.dataset.name,key:btn.dataset.key,choice:btn.dataset.choice,owner:sessionOwner};
      await mutate(s=>action(s,type,args));
    }
    async function transfer(id,count,target) {
      if(busy) return;
      busy=true; let pending, writeStarted=false, settled=false, updaterReturned=false;
      try {
        const current=targetNow();requireThat(sameTarget(target,current),'聊天、楼层或正文已变化，请重新装箱');
        const {variables,...identity}=current;
        pending=await transact(s=>reserve(s,id,count,identity));
        requireThat(alive,'小院已关闭');
        const fresh=targetNow();requireThat(sameTarget(pending.target,fresh),'聊天或楼层已变化，物资将留在小院');
        const api=apiForBackpack();
        // 使用父页面原生同步 updater：在最后一刻读取变量，只合并物品并同批写入收据。
        // 不触发 VARIABLE_UPDATE_ENDED；那是正文 MVU 的完成信号，不能伪造。
        await transact(s=>{requireThat(s.pending?.id===pending.id,'装箱状态已变化');s.pending.attempted=true;});
        writeStarted=true;
        await api.updateVariablesWith(variables=>{
          const now=targetNow();requireThat(sameTarget(pending.target,now),'写入前聊天状态已变化');
          const merged=mergeReward(variables,pending).variables;
          updaterReturned=true;
          return merged;
        },{type:'message',message_id:pending.target.messageId});
        settled=true;
        requireThat(transferReceipt(pending),'写入结果待核对，装箱物资已预留');
        await transact(s=>finishTransfer(s,pending.id));
        render();toast('已将 '+pending.name+' ×'+count+' 转入角色背包');setConnection();
      } catch(error) {
        let confirmed=false;
        if(pending && !writeStarted && alive) await transact(s=>restoreTransfer(s,pending.id)).catch(()=>{});
        // 只有明确完成且未写入，或从未发起请求，才能自动退回；不把超时当失败。
        if(pending && writeStarted && alive) {
          try {
            if(transferReceipt(pending)) {await transact(s=>finishTransfer(s,pending.id));confirmed=true;}
            else if(settled || !updaterReturned) await transact(s=>restoreTransfer(s,pending.id));
          } catch { /* 留待原聊天核对 */ }
        }
        if(confirmed){render();toast('已核对：'+pending.name+' ×'+count+' 已转入背包，不会重复装箱');return;}
        if(alive) {render();toast(error.message,true);}
        throw error;
      } finally {busy=false;}
    }
    async function recoverTransfer() {
      if(busy || !state.pending) return;
      busy=true;
      try {
        const pending=clone(state.pending);
        if(!pending.attempted) {
          await transact(s=>{requireThat(!s.pending?.attempted,'请求状态已变化');restoreTransfer(s,pending.id);});
          toast('尚未发出装箱请求，物资已退回小院');
        } else if(transferReceipt(pending)) {
          await transact(s=>finishTransfer(s,pending.id));toast('确认已经转入，装箱记录已补齐');
        } else {
          modal('这次装箱的结果尚不确定','<p>原楼层尚未找到收据，物资仍封存在本地装箱记录中。为防止迟到的写入造成重复领取，不会自动重发或退回。</p><p>请等待酒馆请求完成后再核对。如果原楼层已被删除、重抽或还原，需要用聊天备份与装箱记录人工核实。</p>',[['cancel','保留记录，稍后核对']]);
        }
        render();
      } catch(error) {toast(error.message,true);}
      finally {busy=false;}
    }
    function readySignature() {
      const now=Date.now();
      return [state.plots.map(p=>ready(p,now)),state.pens.map(p=>!!p&&now>=p.readyAt),state.workshop.map(x=>now>=x.readyAt),
        !!state.expedition&&now>=state.expedition.readyAt,!!state.expedition?.encounter&&now>=state.expedition.encounter.at,
        state.fishing?.phase,!!state.fishing&&now>=state.fishing.biteAt,!!state.fishing&&now>=state.fishing.expiresAt].join('|');
    }
    function releaseFish() {fishHeld=false;$('.hold-btn')?.classList.remove('pressed');}
    function fishKeyDown(event) {
      const focused=event.composedPath()[0];
      if(!['Space','ArrowUp'].includes(event.code)||!root.contains(focused)||/INPUT|TEXTAREA|SELECT/.test(focused?.tagName)||dialog.open)return;
      if(tab!=='fish'||panel.hidden||fishPaused||liveFish?.phase!=='fight'||liveFish.owner!==sessionOwner)return;
      event.preventDefault();fishHeld=true;$('.hold-btn')?.classList.add('pressed');
    }
    function fishKeyUp(event) {if(['Space','ArrowUp'].includes(event.code))releaseFish();}
    function visibilityFish() {if(doc.hidden){releaseFish();fishPaused=!!liveFish;flushFish();}else if(tab==='fish'&&state)render();}
    root.addEventListener('pointerdown',event=>{
      const button=event.target.closest('[data-hold="fish"]');
      if(!button || fishPaused || liveFish?.phase!=='fight' || liveFish.owner!==sessionOwner)return;
      event.preventDefault();button.setPointerCapture?.(event.pointerId);fishHeld=true;button.classList.add('pressed');
    });
    root.addEventListener('contextmenu',event=>{if(event.target.closest('[data-hold="fish"]'))event.preventDefault();});
    doc.addEventListener('pointerup',releaseFish);doc.addEventListener('pointercancel',releaseFish);p.addEventListener('blur',releaseFish);
    doc.addEventListener('keydown',fishKeyDown);doc.addEventListener('keyup',fishKeyUp);doc.addEventListener('visibilitychange',visibilityFish);
    async function flushFish() {
      if(!alive||busy||fishSaving||!liveFish||liveFish.owner!==sessionOwner||liveFish.phase!=='fight')return;
      fishSaving=true;
      try {const id=liveFish.id;await transact(s=>{requireThat(s.fishing?.id===id&&s.fishing.owner===sessionOwner,'这一竿已在其他窗口变化');});}
      catch(error){fishPaused=true;releaseFish();toast('钓鱼进度未保存：'+error.message,true);}
      finally {fishSaving=false;}
    }
    function animateFish(stamp) {
      if(!alive||panel.hidden||tab!=='fish'||doc.hidden||fishPaused||!liveFish||liveFish.owner!==sessionOwner||liveFish.phase!=='fight')return;
      const now=stamp||p.performance.now();
      if(fishLastFrame)fishAccumulator+=Math.min(.1,(now-fishLastFrame)/1000);
      fishLastFrame=now;
      while(fishAccumulator>=1/60){stepFish(liveFish.engine,fishHeld,1/60);fishAccumulator-=1/60;}
      const g=liveFish.engine;
      if(fishDom.bar){fishDom.bar.style.top=(g.bar-g.size/2)+'%';fishDom.bar.style.height=g.size+'%';fishDom.bar.classList.toggle('tracking',g.inside);}
      if(fishDom.fish)fishDom.fish.style.top=g.fish+'%';
      if(fishDom.progress)fishDom.progress.style.width=g.progress+'%';
      if(fishDom.percent)fishDom.percent.textContent=Math.round(g.progress)+'%';
      if(fishDom.status)fishDom.status.textContent=g.inside?'控线稳定':g.fishMode+' · 追上它';
      if(fishDom.chest)fishDom.chest.textContent=g.chestCaught?'✓':'📦';
      if(fishDom.chestProgress)fishDom.chestProgress.style.width=g.chestProgress*100+'%';
      if(g.result) {
        if(!fishLanding&&!busy) {
          fishLanding=true;releaseFish();
          mutate(s=>action(s,'land-fish',{id:liveFish.id,owner:sessionOwner})).then(()=>{fishLanding=false;if(alive)render();});
        }
        return;
      }
      fishFrame=p.requestAnimationFrame(animateFish);
    }
    let beats=0;
    interval=setInterval(async()=>{
      if(!alive || panel.hidden || doc.hidden) return;
      root.querySelectorAll('[data-until]').forEach(el=>{el.textContent=time(Number(el.dataset.until));});
      tick(state); $('#energy').textContent=state.energy+'/'+(10+state.upgrades.tools);
      const inFight=liveFish?.phase==='fight'&&liveFish.owner===sessionOwner&&!fishPaused;
      if(inFight&&beats%2===0)flushFish();
      if(lastReady!==readySignature() && !dialog.open && !busy && !inFight) render();
      if(beats%30===0&&state.idle.enabled&&!busy&&!inFight&&!dialog.open&&tab!=='idle')mutate(()=>null,false);
      if(++beats%10===0 && !busy) {
        try {
          const fresh=await readKey(stateKey);
          if(alive && fresh?.revision!==state.revision && !busy) {state=fresh;if(!dialog.open&&!inFight)render();}
          attachEvents();setConnection();
        } catch(error) {toast('读取存档失败：'+error.message,true);}
      }
    },1000);
    function styles() {
      return `
:host{all:initial;font:14px/1.5 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;color-scheme:dark}
*{box-sizing:border-box}[hidden]{display:none!important}
.garden{--bg:#16181d;--panel:#202329;--raised:#292d34;--text:#eae7e0;--muted:#aaaeb6;--line:#393d44;--accent:#ddb17d;--accent-bg:#393127;--ink:#251c13;--good:#aac5a0;color:var(--text);font:13px/1.55 "Microsoft YaHei","PingFang SC",system-ui,sans-serif;letter-spacing:.01em}
.garden.light{--bg:#f4f1e9;--panel:#fffdf8;--raised:#ece8df;--text:#39342e;--muted:#766d61;--line:#d9d1c4;--accent:#966132;--accent-bg:#f2e5d1;--ink:#fffaf1;--good:#4b754b;color-scheme:light}
h1,h2,h3,h4,p{margin:0}h1{font-size:19px;letter-spacing:.06em}h2{font-size:20px;line-height:1.4}h3{font-size:15px;line-height:1.5}h4{font-size:13px;line-height:1.5}p{color:var(--muted);overflow-wrap:anywhere}small{font-size:11px;color:var(--muted);font-weight:400}b,strong{font-weight:650}
button,input{font:inherit}button{cursor:pointer;border:1px solid var(--line);background:var(--raised);color:var(--text);border-radius:7px;padding:7px 11px;min-height:36px;line-height:1.4;white-space:normal;overflow-wrap:anywhere;transition:background .14s,border-color .14s}
button:hover{border-color:var(--accent);background:var(--accent-bg)}button:disabled{opacity:.42;cursor:not-allowed}button.primary{color:var(--ink);background:var(--accent);border-color:var(--accent);font-weight:700}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button.selected{border-color:var(--accent);background:var(--accent-bg);box-shadow:inset 0 0 0 1px var(--accent)}
.bubble{position:fixed;right:18px;bottom:18px;pointer-events:auto;display:flex;align-items:center;gap:8px;border-color:var(--accent);background:var(--panel);box-shadow:0 6px 24px #0005;padding:10px 14px}
.panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1180px,calc(100% - 24px));height:min(850px,calc(var(--vh,100vh) - 24px));display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden;pointer-events:auto;box-shadow:0 18px 70px #0007;container:garden / inline-size}
header{display:flex;align-items:center;gap:16px;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line);flex-shrink:0}
.brand{display:flex;align-items:center;gap:10px;min-width:0}.mark{display:grid;place-items:center;width:37px;height:37px;color:var(--accent);border:1px solid var(--accent);background:var(--accent-bg);border-radius:8px;font:24px/1 serif}.brand small{font-size:10px;letter-spacing:.08em}
.wallet{display:flex;gap:22px;margin-left:auto;color:var(--muted);font-size:11px}.wallet span{display:flex;align-items:baseline;gap:8px}.wallet b{font-size:17px;color:var(--text);font-variant-numeric:tabular-nums}.header-actions{display:flex;gap:6px}.header-actions button{width:32px;min-height:32px;padding:3px;font-size:20px}
.workspace{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.nav-shell{display:grid;grid-template-columns:28px minmax(0,1fr) 28px;align-items:center;gap:4px;padding:0 10px;background:var(--panel);border-bottom:1px solid var(--line);flex-shrink:0}
nav{display:flex;align-items:stretch;gap:3px;min-width:0;overflow-x:auto;overflow-y:hidden;padding:5px 0 6px;scrollbar-width:thin;scrollbar-color:var(--line) transparent;overscroll-behavior-x:contain;touch-action:pan-x;user-select:none;-webkit-user-select:none;cursor:grab}
nav.dragging,nav.dragging button{cursor:grabbing}nav button{display:flex;align-items:center;gap:7px;flex:0 0 auto;white-space:nowrap;padding:8px 13px;border-color:transparent;background:transparent;border-radius:6px;min-height:35px;touch-action:pan-x}
nav button span{font:10px/1 ui-monospace,monospace;color:var(--muted);opacity:.65}nav button.active{background:var(--accent-bg);color:var(--accent);border-color:var(--line);box-shadow:inset 0 -2px var(--accent)}nav i{display:none}
.nav-arrow{font:24px/1 system-ui;width:28px;height:34px;min-height:34px;padding:0;background:transparent;border-color:transparent}.nav-arrow:disabled{opacity:.2}
main{flex:1;min-width:0;min-height:0;overflow:auto;overflow-x:hidden;padding:18px;overscroll-behavior:contain;scrollbar-gutter:stable;-webkit-overflow-scrolling:touch;touch-action:pan-y}
main:focus{outline:0}main>*+*{margin-top:14px}
footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 16px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);flex-shrink:0}footer span:first-child{min-width:0;overflow-wrap:anywhere}
.eyebrow{font:10px/1.5 ui-monospace,"SFMono-Regular",Consolas,monospace;letter-spacing:.07em;color:var(--accent);text-transform:uppercase}
.heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.heading p{font-size:12px;margin-top:4px}.heading>button{flex-shrink:0}
.card,.selection-panel,.field-board{border:1px solid var(--line);background:var(--panel);border-radius:9px;padding:13px;min-width:0}
.section-title{display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;margin-bottom:2px;border-bottom:1px solid var(--line)}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.stat{display:flex;flex-direction:column;min-width:0;padding:11px 12px;border:1px solid var(--line);background:var(--panel);border-radius:8px}.stat strong{font-size:21px;font-variant-numeric:tabular-nums}.stat span{font-size:10px;color:var(--muted)}.stat small{font-size:11px}
.overview-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.overview-heading h2{margin-top:3px;font-size:21px;letter-spacing:.035em}.weather-tag{white-space:nowrap;color:var(--accent);font-size:12px}
.overview-grid{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:14px;align-items:start}.overview-side{display:grid;gap:12px;min-width:0}.overview-side .task{padding:9px 0}.overview-side .task p{font-size:11px;margin:3px 0}.overview-side .task .progress{margin:5px 0 0}
.homestead{min-width:0;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:var(--panel)}.map-art{position:relative;aspect-ratio:3/2;overflow:hidden;background:#393b3c}.map-art>img{width:100%;height:100%;object-fit:cover;display:block}.map-pin{position:absolute;transform:translate(-50%,-50%);min-width:58px;min-height:41px;display:flex;flex-direction:column;gap:1px;align-items:center;padding:5px 10px;border:1px solid #e9cfa78c;background:#1f232bdd;box-shadow:0 3px 10px #0006;color:#fff4df;border-radius:7px}
.map-pin:hover{background:#453528;border-color:#efc78b;box-shadow:0 0 0 2px #e8bd7755}.map-pin b{font-size:13px}.map-pin small{font:10px/1.2 system-ui;color:#dacbb4}.map-caption{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 12px;color:var(--muted);font-size:11px;border-bottom:1px solid var(--line)}
.compact-stats{gap:0}.compact-stats .stat{background:transparent;border:0;border-radius:0;padding:9px 12px}.compact-stats .stat+.stat{border-left:1px solid var(--line)}
.preview-tools,.compact-help{padding:8px 12px;border:1px dashed var(--line);border-radius:7px;color:var(--muted);font-size:12px}.preview-tools button{margin-top:8px}.compact-help p{margin-top:8px}
.sprite{position:relative;display:block;overflow:hidden;width:48px;height:48px;flex:0 0 auto;background:#e8dfcf;border-radius:7px;isolation:isolate}
.sprite img{position:absolute;width:600%;height:400%;max-width:none;left:calc(var(--sx)*-100%);top:calc(var(--sy)*-100%);display:block}
.sprite.asset-missing::after,.sprite:has(img[hidden])::after{content:"◇";position:absolute;inset:0;display:grid;place-items:center;color:#7c6751;font-size:23px}
.item-symbol{display:grid;place-items:center;width:42px;height:42px;flex:0 0 auto;border:1px solid var(--line);background:var(--raised);border-radius:7px;font-size:25px}
.scene-tile{position:relative;overflow:hidden;aspect-ratio:9/4;background:#383b40;min-width:0;width:100%;max-width:100%;isolation:isolate}.scene-viewport{position:absolute;inset:0;overflow:hidden;container-type:size}.scene-art{position:absolute;width:100%;aspect-ratio:9/4;left:50%;top:50%;transform:translate(-50%,-50%);overflow:hidden}.scene-tile img{position:absolute;width:200%;height:300%;max-width:none;left:calc(var(--sx)*-100%);top:calc(var(--sy)*-100%);display:block}
@supports(width:1cqw){.scene-art{width:max(100cqw,225cqh)}}
.nav-count{font:10px/1.4 system-ui;padding:1px 5px;border-radius:9px;color:var(--ink);background:var(--accent)}
.medal{display:block;position:relative;flex:0 0 auto;width:54px;height:54px;overflow:hidden;background:#e8dfcf;border:1px solid #bba787;border-radius:12px;isolation:isolate}
.medal img{position:absolute;width:300%;height:200%;max-width:none;left:calc(var(--mx)*-100%);top:calc(var(--my)*-100%);display:block}.medal-large{width:88px;height:88px;border-radius:17px}.medal.asset-missing::after,.medal:has(img[hidden])::after{content:"章";position:absolute;inset:0;display:grid;place-items:center;color:#785a3a;font-size:24px}
.achievement-summary,.achievement-link{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.achievement-summary{padding:10px 14px;border:1px solid var(--line);background:var(--panel);border-radius:8px;color:var(--muted)}.achievement-summary b{color:var(--accent);font-size:20px}.achievement-link p{font-size:12px}
.achievement-filters{display:flex;flex-wrap:wrap;gap:6px}.achievement-filters button{min-height:32px;padding:5px 10px;font-size:12px}.achievement-filters small{margin-left:3px}
.achievement-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;align-items:start;gap:14px}.achievement-browser{min-width:0}.achievement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;align-items:stretch}
.achievement-card{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:11px;min-width:0;background:var(--panel);border-radius:9px}.achievement-copy{display:block;min-width:0;flex:1}.achievement-title{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:3px 7px}.achievement-title b{font-size:13px}.achievement-title small{font-size:10px}.achievement-goal,.achievement-progress,.achievement-prize{display:block;font-size:11px;margin-top:5px;color:var(--muted)}.achievement-progress{font-variant-numeric:tabular-nums;color:var(--text)}.achievement-card .progress{margin:5px 0;height:4px}.achievement-prize{font-size:10px;line-height:1.6}.achievement-card.ready .achievement-title small{color:var(--accent);font-weight:700}.achievement-card.ready{border-color:var(--accent)}.achievement-card.claimed .medal{filter:saturate(.6)}
.achievement-detail{position:sticky;top:0;padding:14px}.achievement-detail-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}.achievement-detail-head>div{min-width:0}.achievement-detail-head h3{font-size:17px;margin:3px 0 6px}.achievement-detail>p{font-size:12px}.achievement-detail-progress{margin:10px 0;font-size:12px}.achievement-detail-progress .progress{margin-top:6px}.achievement-detail>button{width:100%;margin-top:12px}.achievement-rewards{border:1px solid var(--line);border-radius:7px;overflow:hidden}.achievement-rewards>div{padding:8px 10px;background:var(--bg)}.achievement-rewards>div+div{border-top:1px solid var(--line)}.achievement-rewards b,.achievement-rewards small{display:block;font-size:12px}.achievement-rewards small{font-size:10px;margin-top:2px}.achievement-requirements{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.achievement-requirements span{font-size:11px;border:1px solid var(--line);border-radius:4px;padding:2px 5px}
.achievement-pagination{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:11px}.achievement-pagination button{font-size:11px;min-height:32px;padding:5px 9px}
@container garden (max-width:980px){.achievement-layout{grid-template-columns:minmax(0,1fr) 245px}.achievement-grid{grid-template-columns:1fr}.achievement-card .medal{width:46px;height:46px}.achievement-title{flex-wrap:nowrap}}
@container garden (max-width:720px){.achievement-layout{display:flex;flex-direction:column;gap:10px}.achievement-browser,.achievement-detail{width:100%}.achievement-detail{position:static;order:-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px 12px;padding:11px}.achievement-detail-head{margin:0;gap:9px}.achievement-detail-head h3{font-size:15px}.achievement-detail .medal-large{width:62px;height:62px}.achievement-detail>p{grid-column:1;font-size:11px}.achievement-detail-progress{grid-column:1;margin:0}.achievement-requirements{grid-column:1;margin:0}.achievement-rewards{grid-column:2;grid-row:1/5;align-self:start}.achievement-rewards>div{padding:6px 8px}.achievement-detail>button{grid-column:1/-1;margin-top:0;min-height:33px;font-size:12px}.achievement-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.achievement-card{padding:9px;gap:7px}.achievement-title{flex-wrap:wrap}}
@container garden (max-width:480px){.achievement-summary{gap:5px 10px;padding:8px 10px;font-size:11px}.achievement-summary b{font-size:17px}.achievement-summary>small{display:none}.achievement-filters{gap:5px}.achievement-filters button{padding:5px 8px;font-size:11px}.achievement-grid{grid-template-columns:1fr}.achievement-title{flex-wrap:nowrap}.achievement-detail-head{gap:6px}.achievement-detail .medal-large{width:45px;height:45px}.achievement-detail-head h3{font-size:13px}.achievement-detail-head small{font-size:9px}.achievement-detail-head .pill{font-size:10px}.achievement-rewards b{font-size:11px}.achievement-rewards small{font-size:9px}.achievement-detail{gap:7px}.achievement-card .medal{width:49px;height:49px}.achievement-title b{font-size:12px}.achievement-goal{margin-top:4px}.achievement-prize{font-size:10px}.achievement-detail>p{font-size:11px}}
.scene-tile.asset-missing::after,.scene-tile:has(img[hidden])::after{content:"场景图片暂未加载";display:grid;place-items:center;position:absolute;inset:0;color:#d4cec3;font-size:12px}
.management-layout{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:14px;align-items:start}.field-board{padding:12px;background:var(--panel)}
.board-legend{display:flex;gap:14px;align-items:center;color:var(--muted);font-size:11px;padding:0 2px 10px}.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--muted);margin-right:5px;vertical-align:middle}.dot.ready{background:var(--good)}
.land-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.land-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;min-height:116px;padding:11px 5px 6px;border:1px solid var(--line);background:var(--bg);border-radius:7px;text-align:center}
.land-tile .sprite{width:55px;height:55px;margin:4px 0 0}.land-tile b{font-size:12px}.land-tile small{font-size:10px;font-variant-numeric:tabular-nums;min-height:16px}.tile-index{position:absolute;top:4px;left:6px;color:var(--muted);font:9px/1.2 ui-monospace,monospace}.tile-ready{position:absolute;top:4px;right:6px;font-size:10px;color:var(--good)}
.land-tile.ready:not(.selected){border-color:var(--good)}.land-tile .progress{width:calc(100% - 6px);height:3px;margin:0}.land-tile.selected .tile-index{color:var(--accent)}
.pen-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.pen-tile{min-height:130px}.pen-tile .sprite{width:70px;height:70px}
.selection-panel{position:sticky;top:0;padding:15px;box-shadow:0 4px 16px #0001}.selection-title{display:flex;align-items:center;gap:12px;min-width:0;margin-bottom:12px}.selection-title .sprite{width:60px;height:60px}.selection-title>div{min-width:0}.selection-title h3{font-size:17px;overflow-wrap:anywhere}.selection-title p,.selection-panel>p{font-size:12px;margin-top:4px}.selection-panel>small{display:block;margin-top:8px}
.selection-tags{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.selection-tags span{font-size:11px;color:var(--muted);background:var(--raised);padding:3px 6px;border-radius:4px}
.progress{height:5px;background:var(--raised);border-radius:5px;overflow:hidden;margin:9px 0}.progress i{display:block;height:100%;background:var(--accent);border-radius:4px}
.actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:center}.actions button{flex:1;min-width:60px}.selection-panel .actions{margin-top:12px}.trouble-row{display:flex;align-items:center;gap:6px;margin:9px 0;flex-wrap:wrap}.warning{color:#e3a57c;font-size:11px}.light .warning{color:#9a5029}
.danger-zone{display:flex;align-items:center;gap:10px;padding-top:12px;margin-top:12px;border-top:1px dashed var(--line)}.danger-zone button{font-size:11px;min-height:30px;padding:4px 10px}.danger-zone small{font-size:10px}
.task{display:flex;align-items:center;gap:10px;padding:10px 0}.task+ .task{border-top:1px solid var(--line)}.task>div{flex:1;min-width:0}.task p{font-size:12px;margin:4px 0}.task button{font-size:12px;flex-shrink:0;min-height:32px}
.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}details summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-weight:650}summary::before{content:"＋";color:var(--accent)}summary::-webkit-details-marker{display:none}details[open]>summary::before{content:"−"}details[open]>summary{margin-bottom:10px}summary small{margin-left:auto}
.upgrade-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.upgrade{display:flex;align-items:center;gap:10px;border:1px solid var(--line);padding:10px;border-radius:7px}.upgrade>div{flex:1;min-width:0}.upgrade p{font-size:12px;margin-top:3px}.upgrade button{flex-shrink:0;font-size:12px}
.journal{max-height:230px;overflow:auto}.journal p{display:flex;gap:10px;align-items:baseline;padding:7px 0;font-size:12px}.journal time{color:var(--accent);font-size:10px;white-space:nowrap}.journal p+p{border-top:1px solid var(--line)}
.tags{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.tags span,.pill{display:inline-block;font-size:10px;padding:2px 6px;border:1px solid var(--line);border-radius:5px;background:var(--raised);color:var(--muted)}.pill{background:var(--accent-bg);color:var(--accent)}
.note{border-left:2px solid var(--accent);padding:3px 10px;font-size:11px;color:var(--muted)}.note p{font-size:11px}
.tackle-strip{display:flex;gap:6px;flex-wrap:wrap}.tackle-strip>button{flex:1;min-width:85px;text-align:left;font-size:12px}
.pond{padding:0;overflow:hidden;text-align:left;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(220px,1fr);align-items:center;gap:0}
.pond-scene{grid-row:1/3;aspect-ratio:auto;height:auto;min-height:210px;align-self:stretch}
.pond-status{padding:15px 18px 6px}.pond-status h3{font-size:17px;margin:7px 0}.pond-status p{font-size:12px}.pond>.actions{padding:7px 18px 15px}
.fish-battle{max-width:720px;margin-inline:auto}.fish-board{display:grid;grid-template-columns:130px minmax(0,1fr);align-items:center;gap:24px;padding:0 0 12px}.fish-lane{position:relative;overflow:hidden;width:90px;height:clamp(190px,calc(var(--vh,100vh) - 285px),330px);margin:auto;background:linear-gradient(#354a5b,#1c2734);border:1px solid #657789;border-radius:9px;box-shadow:inset 0 0 18px #0006}
.fish-waterlines{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0,transparent 25px,#ffffff0c 26px)}
#fish-player{position:absolute;left:5px;right:5px;background:#ddb17d65;border:2px solid #edc498;border-radius:5px}#fish-player.tracking{background:#edc4989c;box-shadow:0 0 12px #edc49844}#fish-target{position:absolute;left:50%;transform:translate(-50%,-50%);font-size:26px;line-height:1;filter:drop-shadow(0 2px 2px #0008)}#fish-chest{position:absolute;left:7px;transform:translateY(-50%);font-size:18px;color:#ffe0b0}
.fish-instructions h3{font-size:22px;margin:8px 0}.fish-instructions p{font-size:13px;margin:8px 0}.fish-instructions>strong{font-size:12px;display:block;color:var(--accent);margin:8px 0}.fish-instructions small{font-size:10px}
.hold-btn{width:100%;min-height:58px;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.hold-btn small{display:block;color:inherit;opacity:.8;margin-top:4px}.hold-btn.pressed{filter:brightness(1.12);box-shadow:inset 0 3px 10px #0004}
.fish-secondary{margin-top:7px}.fish-secondary button{min-height:30px;font-size:11px;padding:5px 8px}.chest-note{padding:6px 8px;border:1px dashed var(--line);border-radius:6px;font-size:11px;margin-top:8px}.chest-note .progress{margin:5px 0 0}.catch-meter{display:flex;justify-content:space-between;gap:12px;font-size:12px}.catch-meter b{color:var(--accent);font-size:16px}.catch-progress{height:8px;margin-bottom:0}
.collection{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.collection>div{display:flex;flex-direction:column;align-items:center;text-align:center;padding:9px 5px;border:1px solid var(--line);border-radius:7px}.collection span{font-size:23px}.collection b{font-size:12px}.collection small{font-size:10px}.unknown{opacity:.52}
.zone-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.zone.card{padding:0;overflow:hidden;display:grid;grid-template-columns:42% minmax(0,1fr);align-items:stretch}.zone .scene-tile{height:auto;aspect-ratio:auto;min-height:150px}.zone-copy{padding:12px;min-width:0}.zone-copy h3{font-size:15px}.zone-copy>p{font-size:11px;margin:5px 0}.zone-copy>button{width:100%;font-size:12px;min-height:32px}
.row{display:flex;align-items:center;justify-content:space-between;gap:8px}.encounter-options{display:grid;gap:7px;margin:10px 0}.encounter-options button{text-align:left;font-size:12px}
.workshop-banner{display:flex;gap:16px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:9px;overflow:hidden}.workshop-banner .scene-tile{width:180px;flex-shrink:0}.workshop-banner .heading{padding:8px 12px 8px 0}.workshop-banner h2{font-size:19px}
.recipe-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:430px;overflow-y:auto;overscroll-behavior-y:contain;min-width:0;padding:1px 5px 2px 1px}
.recipe-option{display:flex;align-items:center;gap:9px;text-align:left;min-width:0;padding:8px}.recipe-option>span:not(.sprite):not(.item-symbol){flex:1;min-width:0}.recipe-option b{display:block;font-size:12px;overflow-wrap:anywhere}.recipe-option small{display:block;font-size:10px}.recipe-option .sprite,.recipe-option .item-symbol{width:34px;height:34px;font-size:21px}.recipe-detail>.ingredients{margin:13px 0}
.ingredients{display:flex;flex-wrap:wrap;gap:5px}.ingredients span{font-size:11px;padding:3px 6px;border:1px dashed var(--line);border-radius:4px;color:var(--muted)}.ingredients .enough{border-style:solid;border-color:var(--accent);color:var(--accent)}
.job-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.job-strip .task{border:0}
.stock-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.stock-tile{position:relative;display:flex;align-items:center;flex-direction:column;gap:5px;min-width:0;padding:17px 5px 7px;background:var(--panel)}.stock-tile .sprite{width:45px;height:45px}.stock-tile b{font-size:12px;overflow-wrap:anywhere}.stock-tile small{font-size:10px}.stock-count{position:absolute;top:3px;right:5px;font:10px/1.3 ui-monospace,monospace;color:var(--accent)}.stock-detail .actions{flex-direction:column}.quantity{font-size:13px;color:var(--accent)}
.project-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px}.project-card p{font-size:12px}.idle-art{width:100%;max-height:155px}.milestone-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.milestone{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:7px;padding:11px}.milestone p{font-size:11px;margin-top:6px}.milestone .row{align-items:start}.milestone small{font-size:10px;margin-bottom:8px}.milestone button{margin-top:auto;min-height:30px;font-size:11px}
.idle-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.check-row{display:flex;align-items:start;gap:10px;padding:12px 0;cursor:pointer;border-bottom:1px solid var(--line)}.check-row span{min-width:0}.check-row b{font-size:13px}.check-row small{display:block;font-size:11px;margin-top:3px}.check-row input{width:17px;height:17px;flex-shrink:0;margin:2px 0;accent-color:var(--accent)}.idle-settings input[type=number]{width:76px;padding:7px}.idle-settings .field{gap:8px;font-size:12px;flex-wrap:wrap}.idle-settings~p{font-size:12px}.idle-settings~button{margin-top:12px}.idle-report{font-size:12px;margin-top:10px}
.empty{text-align:center;padding:32px 12px}.empty p{margin:9px 0 18px}.notice{padding:13px;border:1px solid var(--accent);background:var(--accent-bg);border-radius:8px}.notice p{font-size:12px;margin:7px 0}.loading{padding:50px;text-align:center;color:var(--muted)}
dialog{pointer-events:auto;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:0;width:min(620px,calc(100% - 20px));max-height:calc(var(--vh,100vh) - 24px);box-shadow:0 20px 80px #0008;overflow:hidden}dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:#0b0d12ba}.dialog-head{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line);flex-shrink:0}.dialog-head h2{flex:1;font-size:17px}.dialog-head button{min-height:30px;padding:3px 8px;font-size:22px}
.dialog-content{padding:15px;overflow-y:auto;min-height:0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}.dialog-actions{display:flex;justify-content:flex-end;gap:8px;padding:11px 15px;border-top:1px solid var(--line);flex-shrink:0}.dialog-error{padding:10px 15px;margin:0;color:#edaca4;background:var(--accent-bg);border-top:1px solid var(--line);font-size:12px;flex-shrink:0}.light .dialog-error{color:#963e32}
.picker{display:grid;gap:7px}.picker>button{display:flex;align-items:center;gap:10px;padding:9px;text-align:left}.picker>button>div{flex:1;min-width:0}.picker h3{font-size:14px}.picker p{font-size:11px;margin-top:3px}.picker .selected{border-color:var(--accent);background:var(--accent-bg)}.picker .item-icon{font-size:25px}.picker .sprite{width:40px;height:40px}
.dialog-content>p{font-size:12px;margin:5px 0 12px}.pack-title{display:flex;align-items:center;gap:12px;margin-bottom:14px}.item-icon{font-size:27px;flex-shrink:0}.field{display:flex;align-items:center;gap:12px;margin:14px 0}.field input{min-width:0;width:110px}.field input,input[type=number]{padding:8px;background:var(--raised);color:var(--text);border:1px solid var(--line);border-radius:6px}
.toast{position:fixed;z-index:10;bottom:20px;left:50%;transform:translateX(-50%);max-width:min(560px,calc(100vw - 24px));padding:10px 16px;color:var(--text);background:var(--raised);border:1px solid var(--accent);border-radius:8px;box-shadow:0 6px 26px #0006;pointer-events:auto;font-size:12px}.toast.error{border-color:#d38c83}
::-webkit-scrollbar{width:6px;height:5px}::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px}::-webkit-scrollbar-track{background:transparent}
@container garden (max-width:980px){.overview-grid{grid-template-columns:minmax(0,1fr) 250px}.management-layout{grid-template-columns:minmax(0,1fr) 250px}.land-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.land-tile{min-height:108px}.land-tile .sprite{width:48px;height:48px}.stock-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.zone.card{grid-template-columns:38% minmax(0,1fr)}}
@container garden (max-width:720px){header{padding:10px 14px;gap:12px}.wallet{gap:12px}.wallet span{flex-direction:column;gap:0;font-size:10px}.wallet b{font-size:16px}main{padding:12px}.overview-grid{grid-template-columns:minmax(0,1fr)}.overview-side{grid-template-columns:repeat(2,minmax(0,1fr))}.map-art{max-height:355px}.map-art>img{object-fit:cover}.management-layout{grid-template-columns:minmax(0,1fr)}.land-grid{grid-template-columns:repeat(6,minmax(0,1fr))}.selection-panel{position:static;padding:12px}.selection-title{margin-bottom:8px}.selection-panel .actions{margin-top:8px}.selection-title .sprite{width:48px;height:48px}.selection-title h3{font-size:16px}.selection-panel .selection-tags{margin:6px 0}.stock-detail .actions{flex-direction:row}.inventory-layout{display:flex;flex-direction:column}.inventory-layout .stock-grid{width:100%;grid-template-columns:repeat(5,minmax(0,1fr))}.inventory-layout .stock-detail{order:-1;width:100%}.recipe-list{max-height:265px;grid-template-columns:repeat(3,minmax(0,1fr))}.recipe-option{gap:6px}.milestone-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.collection{grid-template-columns:repeat(4,minmax(0,1fr))}.pond{grid-template-columns:1fr}.pond-scene{grid-row:auto;height:auto;min-height:0;max-height:210px}.pond-status{padding:12px 14px 4px}.pond>.actions{padding:6px 14px 13px}.zone-grid{gap:9px}.zone.card{display:block}.zone .scene-tile{height:auto;min-height:0;aspect-ratio:9/4}.zone-copy{padding:10px}}
@container garden (max-width:480px){header{padding:8px 10px;gap:8px}.brand{gap:7px}.brand small{display:none}.mark{width:29px;height:29px;font-size:20px}h1{font-size:16px}.wallet{gap:9px}.wallet b{font-size:14px}.header-actions{gap:4px}.header-actions button{width:28px;min-height:29px;font-size:18px}.nav-shell{padding:0 4px;gap:1px;grid-template-columns:23px minmax(0,1fr) 23px}.nav-arrow{width:23px}nav{padding:4px 0 5px}nav button{gap:5px;padding:7px 10px;min-height:33px;font-size:12px}nav button span{font-size:9px}
main{padding:10px}main>*+*{margin-top:11px}.heading{gap:8px;align-items:center}.heading h2{font-size:18px}.heading p{font-size:11px}.heading>button{font-size:11px;padding:7px 8px;min-height:33px}.overview-heading{gap:6px;align-items:start}.overview-heading h2{font-size:16px}.overview-heading .eyebrow{font-size:8px}.weather-tag{font-size:10px}.overview-grid{gap:10px}.overview-side{gap:8px}.overview-side .card{padding:10px}.overview-side .task{flex-wrap:wrap;gap:4px}.overview-side .task>div{flex-basis:100%}.overview-side .task button{width:100%;min-height:29px;font-size:11px}.overview-side .section-title h3{font-size:13px}.overview-side .task h4{font-size:12px}.map-pin{min-width:44px;min-height:39px;padding:3px 7px}.map-pin b{font-size:11px}.map-pin small{font-size:9px}.map-caption{padding:6px 8px;font-size:10px;gap:4px}.map-caption small{font-size:9px}
.stats{gap:6px}.stat{padding:8px}.stat strong{font-size:18px}.stat small{font-size:10px}.stat span{font-size:9px}.compact-stats{gap:0}.compact-stats .stat{padding:8px}
.field-board{padding:8px}.board-legend{padding-bottom:8px;font-size:10px;gap:10px}.land-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.land-tile{min-height:94px;padding:10px 3px 5px;gap:2px}.land-tile .sprite{width:40px;height:40px}.land-tile b{font-size:11px}.land-tile small{font-size:9px}.tile-index{font-size:8px;left:4px}.tile-ready{font-size:9px;right:4px}.pen-grid{gap:6px}.pen-tile{min-height:112px}.pen-tile .sprite{width:58px;height:58px}.selection-panel{padding:11px}.selection-title{gap:9px}.selection-title h3{font-size:15px}.selection-panel .actions button{font-size:12px}.selection-tags span{font-size:10px}.selection-panel>p{font-size:11px}.selection-panel>small{font-size:10px}.selection-title .eyebrow{font-size:9px}
.tackle-strip{gap:5px}.tackle-strip>button{padding:6px;font-size:11px;min-width:70px}.pond-status h3{font-size:15px}.pond-status p{font-size:11px}.pond-scene{max-height:none}.fish-board{grid-template-columns:73px minmax(0,1fr);gap:13px}.fish-lane{width:68px;height:clamp(185px,calc(var(--vh,100vh) - 255px),295px)}.fish-instructions h3{font-size:18px}.fish-instructions p{font-size:11px;margin:6px 0}.fish-instructions>strong{font-size:11px}.hold-btn{min-height:51px;font-size:12px}.hold-btn small{font-size:9px}.chest-note{font-size:10px;padding:5px}.collection{grid-template-columns:repeat(3,minmax(0,1fr))}
.zone-copy{padding:9px}.zone-copy h3{font-size:13px}.zone-copy>p{font-size:10px}.zone-copy .tags{gap:4px;margin:6px 0}.zone-copy .tags span{font-size:9px;padding:2px 4px}.zone-copy>button{font-size:11px}
.workshop-banner{gap:9px}.workshop-banner .scene-tile{width:98px;aspect-ratio:9/5}.workshop-banner h2{font-size:16px}.workshop-banner .heading{padding-right:7px}.workshop-banner p{font-size:10px}.recipe-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;max-height:225px}.recipe-option{padding:6px;gap:6px}.recipe-option .sprite,.recipe-option .item-symbol{width:28px;height:28px;font-size:18px}.recipe-option b{font-size:11px}.recipe-option small{font-size:9px}.recipe-option .dot{display:none}.job-strip{grid-template-columns:1fr;gap:0}.job-strip .task{padding:7px 0}.job-strip .task+.task{border-top:1px solid var(--line)}
.inventory-layout .stock-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.stock-tile{padding:15px 3px 6px;gap:3px}.stock-tile .sprite{width:39px;height:39px}.stock-tile .item-symbol{width:36px;height:36px;font-size:22px}.stock-tile b{font-size:11px}.stock-tile small{font-size:9px}.stock-count{font-size:9px}.stock-detail .actions button{min-width:64px}.stock-detail .actions button.primary{flex:2}
.card{padding:11px}.upgrade-grid,.columns{grid-template-columns:1fr}.milestone-grid{gap:6px}.milestone{padding:9px}.milestone .row{flex-wrap:wrap;gap:3px}.milestone h4{font-size:12px}.milestone p{font-size:10px}.milestone button{font-size:10px}.idle-settings{grid-template-columns:1fr}.check-row{padding:10px 0}.check-row b{font-size:12px}.check-row small{font-size:10px}.project-card p{font-size:11px}.section-title{padding-bottom:7px}.section-title h3{font-size:14px}
footer{padding:5px 10px;font-size:9px}summary{font-size:12px}summary small{font-size:10px}.dialog-head{padding:11px 12px}.dialog-head h2{font-size:15px}.dialog-content{padding:12px}.dialog-actions{padding:10px 12px}.dialog-actions button{font-size:12px}.picker h3{font-size:13px}.picker .sprite{width:36px;height:36px}}
@container garden (max-width:720px){main[data-page="farm"] .management-layout,main[data-page="ranch"] .management-layout{display:flex;flex-direction:column}main[data-page="farm"] .field-board,main[data-page="ranch"] .field-board{width:100%}main[data-page="farm"] .selection-panel,main[data-page="ranch"] .selection-panel{order:-1;position:sticky;top:-1px;z-index:2;width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px}main[data-page="farm"] .selection-title,main[data-page="ranch"] .selection-title{margin:0;grid-column:1;grid-row:1}main[data-page="farm"] .selection-panel>.actions,main[data-page="ranch"] .selection-panel>.actions{grid-column:2;grid-row:1;align-items:center;margin:0;max-width:175px}main[data-page="farm"] .selection-panel>.progress{display:none}main[data-page="farm"] .selection-tags,main[data-page="ranch"] .selection-tags{grid-column:1/-1;margin:0}main[data-page="farm"] .trouble-row,main[data-page="ranch"] .danger-zone{grid-column:1/-1;margin:0;padding-top:5px}main[data-page="farm"] .selection-title p,main[data-page="ranch"] .selection-title p{font-size:10px}.management-layout .selection-title .sprite{width:40px;height:40px}}
@container garden (max-width:480px){main[data-page="farm"] .selection-panel>.actions,main[data-page="ranch"] .selection-panel>.actions{max-width:88px}main[data-page="farm"] .selection-panel>.actions button,main[data-page="ranch"] .selection-panel>.actions button{font-size:11px;padding:7px 8px}main[data-page="farm"] .selection-title p,main[data-page="ranch"] .selection-title p{display:none}main[data-page="ranch"] .selection-panel>.actions{gap:4px}main[data-page="ranch"] .danger-zone small{font-size:9px}.map-art{max-height:none}}
@container garden (max-width:340px){.brand .mark{display:none}.wallet{gap:8px}.overview-heading h2{font-size:14px}.weather-tag{font-size:9px}.map-pin small{display:none}.map-pin{min-height:32px;min-width:39px;padding:4px 6px}.land-tile .sprite{width:35px;height:35px}.land-tile{min-height:89px}.recipe-option .item-symbol{width:24px;height:24px}.stock-tile .sprite{width:34px;height:34px}}
@container garden (max-width:720px){.pond-scene{aspect-ratio:9/4}}
@media(max-width:600px){.panel{width:calc(100% - 8px);height:calc(var(--vh,100vh) - 8px);border-radius:9px}.bubble{right:10px;bottom:10px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;
    }
  }
})();
