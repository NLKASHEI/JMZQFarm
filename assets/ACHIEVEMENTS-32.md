# 32枚独立成就徽章

4.3.1 使用内置 imagegen 生成32个独立图案，按稳定成就ID一对一绑定；不再按六个分类复用图案。为节省请求，32枚不同图案打包为四张4列2行图集，四张合计约1.1MB。旧 `medals` 图集只留作历史原稿，不再被运行时引用。

实际交付每张1774×887，正好2:1；每个单元443.5×443.5，UI按比例取样，不错误假定原图一定是提示词要求的2048×1024。`heavy_fish` 采样区域单独上移8px，完整保留称重吊环；32个样本的6px边缘均单独检查。

## 原稿、交付与绑定

| 图集（原稿 / WebP） | 由左至右，上行再下行 |
| --- | --- |
| [PNG](v4.2/achievement-a.png) / [WebP](v4.2/achievement-a.webp) | first_harvest、harvest_25、harvest_100、crop_catalog、harvest_500、ranch_1、ranch_30、ranch_100 |
| [PNG](v4.2/achievement-b.png) / [WebP](v4.2/achievement-b.webp) | ranch_300、fish_1、perfect_1、fish_25、treasure_3、heavy_fish、perfect_10、fish_100 |
| [PNG](v4.2/achievement-c.png) / [WebP](v4.2/achievement-c.webp) | fish_master、explore_1、explore_5、explorer_20、new_world、explore_60、discovery_all、craft_1 |
| [PNG](v4.2/achievement-d.png) / [WebP](v4.2/achievement-d.webp) | crafter_15、craft_50、craft_150、collector、idle_home、all_rounder、level_15、projects_3 |

## 最终提示词集

### achievement-a

```text
Use case: stylized-concept. Asset type: production raster achievement icon atlas for a cozy autumn farming and survival game. Create ONE landscape image EXACTLY 2048x1024 pixels, precisely FOUR columns and TWO rows of equal 512x512 cells. The output is an atlas with EIGHT completely DIFFERENT illustrated collectible enamel pins. No grid lines. Uniform FLAT pale parchment background #e8dfcf. Every pin and its shadow fits entirely in a centered 360x360 safe square in its own 512x512 cell (76px blank margin on all four sides). All cells same visual scale, centered, absolutely no neighboring fragments or overlaps. Style: premium hand-painted miniature enamel and aged copper collectible pins, charming intricate artisanal detail but bold clean silhouettes readable at 56px, restrained antique gold, ivory, muted berry red, slate blue, warm autumn lighting, gentle dimensional shading. NOT flat vector, NOT emoji, NOT generic repeated circular medals. Each pin follows the DISTINCT silhouette of its subject with a narrow copper rim, not the same round border repeated. No text, numbers, letters, captions, logos, watermark, grid lines, or background scenery outside pins. Eight cell subjects in STRICT ROW-MAJOR ORDER, left to right top row, then left to right bottom row:
1. First harvest: a little wooden harvest pail containing two freshly dug potatoes with one green sprout; small rustic copper silhouette.
2. Basket filling up: a plump woven wicker basket of carrots, red tomatoes and one cabbage, handle arch clearly visible.
3. Abundant grain: a golden wheat sheaf tied with red cord crossed with one curved harvesting sickle, elegant long oval silhouette.
4. Twelve crop varieties: a little open wooden seed collectors cabinet showing colorful distinct seeds and a strawberry, corn and pumpkin, a rectangular cabinet silhouette.
5. Four-season granary: a tall rustic wooden grain silo with warm amber roof and golden grain spilling gently from a small opening; distinctive architectural shape.
6. First ranch produce: a straw nest containing three cream eggs with a single soft feather, warm cream and gold oval pin.
7. Ranch hand: a beautifully embossed brass cowbell hanging from a folded russet leather collar, bell silhouette, no animal portrait.
8. Ranch daily life: a tall silver milk churn beside a folded cream wool blanket and a wooden spool of yarn, miniature still-life pin.
Exactly eight pins. Keep all eight subjects unique and inside their assigned cell. High quality final game artwork.
```

### achievement-b

```text
Use case: stylized-concept. Asset type: production raster achievement icon atlas for a cozy autumn farming and survival game. Create ONE landscape image EXACTLY 2048x1024 pixels, precisely FOUR columns and TWO rows of equal 512x512 cells. The output is an atlas with EIGHT completely DIFFERENT illustrated collectible enamel pins. No grid lines. Uniform FLAT pale parchment background #e8dfcf. Every pin and its shadow fits entirely in a centered 360x360 safe square in its own 512x512 cell (76px blank margin on all four sides). All cells same visual scale, centered, absolutely no neighboring fragments or overlaps. Style: premium hand-painted miniature enamel and aged copper collectible pins, charming intricate artisanal detail but bold clean silhouettes readable at 56px, restrained antique gold, ivory, muted berry red, slate blue, warm autumn lighting, gentle dimensional shading. NOT flat vector, NOT emoji, NOT generic repeated circular medals. Each pin follows the DISTINCT silhouette of its subject with a narrow copper rim, not the same round border repeated. No text, numbers, letters, captions, logos, watermark, grid lines, or background scenery outside pins. Eight cell subjects in STRICT ROW-MAJOR ORDER, left to right top row, then left to right bottom row:
1. Prosperous ranch: a red-roof barn with a tiny rooster weather vane, a golden horseshoe framing the barn entrance; large prestigious enamel pin.
2. First bite: a red-and-cream fishing bobber tipping into a blue splash, a fine copper fishing line curls above it; teardrop silhouette.
3. First perfect catch: a single graceful golden fishing hook attached to a taut fine line inside a perfectly calm circular blue ripple, minimal elegant round pin.
4. Experienced angler: a woven fishing creel with a silver fish tail peeking out and a short wooden handle; warm brown basket silhouette.
5. Three underwater treasures: an open weathered pirate-style treasure chest with glowing amber coins, one blue gem and coiled wet rope; no text.
6. Heavyweight catch: a hefty long blue-gray sturgeon hung horizontally beneath an antique brass hanging scale, weighty trophy silhouette; no readable numbers.
7. Ten perfect catches: a finely crafted large bronze fishing reel with a silver spool and one prominent ivory star at its edge, mechanical round silhouette.
8. One hundred fish: a dynamic spiral shoal of six little silver-blue fish around a single amber center jewel, sweeping circular crest; no fishing hook.
Exactly eight pins. Keep all eight subjects unique and inside their assigned cell. High quality final game artwork.
```

### achievement-c

```text
Use case: stylized-concept. Asset type: production raster achievement icon atlas for a cozy autumn farming and survival game. Create ONE landscape image EXACTLY 2048x1024 pixels, precisely FOUR columns and TWO rows of equal 512x512 cells. The output is an atlas with EIGHT completely DIFFERENT illustrated collectible enamel pins. No grid lines. Uniform FLAT pale parchment background #e8dfcf. Every pin and its shadow fits entirely in a centered 360x360 safe square in its own 512x512 cell (76px blank margin on all four sides). All cells same visual scale, centered, absolutely no neighboring fragments or overlaps. Style: premium hand-painted miniature enamel and aged copper collectible pins, charming intricate artisanal detail but bold clean silhouettes readable at 56px, restrained antique gold, ivory, muted berry red, slate blue, warm autumn lighting, gentle dimensional shading. NOT flat vector, NOT emoji, NOT generic repeated circular medals. Each pin follows the DISTINCT silhouette of its subject with a narrow copper rim, not the same round border repeated. No text, numbers, letters, captions, logos, watermark, grid lines, or background scenery outside pins. Eight cell subjects in STRICT ROW-MAJOR ORDER, left to right top row, then left to right bottom row:
1. Complete fish encyclopedia: an open thick blue-bound naturalists field book with colorful fish miniature illustrations and a red bookmark, no writing.
2. First expedition: a half-open little wooden garden gate framing a sunlit dirt path, small copper latch; archway silhouette.
3. Five expeditions: a pair of worn leather hiking boots beside one fallen autumn leaf and a rolled cloth bedroll, earthy asymmetrical pin.
4. Twenty expeditions: an antique brass pocket compass with sharp ivory needle and a folded strap, dark slate-blue face, no letters.
5. Eight discoveries: a partially unrolled parchment map with several tiny location pins, and a little magnifying glass examining one marked ruin, no readable writing.
6. Sixty expeditions: a weathered leather expedition backpack carrying a bedroll, a tiny metal cup and an orange climbing rope, vertical silhouette.
7. All twelve discoveries: an ornate four-point golden compass rose framing a miniature mountain horizon and amber rising sun, no needles or map scroll.
8. First handmade item: a small sturdy wooden hammer striking a single brass nail into a wood block, miniature tool silhouette.
Exactly eight pins. Keep all eight subjects unique and inside their assigned cell. High quality final game artwork.
```

### achievement-d

```text
Use case: stylized-concept. Asset type: production raster achievement icon atlas for a cozy autumn farming and survival game. Create ONE landscape image EXACTLY 2048x1024 pixels, precisely FOUR columns and TWO rows of equal 512x512 cells. The output is an atlas with EIGHT completely DIFFERENT illustrated collectible enamel pins. No grid lines. Uniform FLAT pale parchment background #e8dfcf. Every pin and its shadow fits entirely in a centered 360x360 safe square in its own 512x512 cell (76px blank margin on all four sides). All cells same visual scale, centered, absolutely no neighboring fragments or overlaps. Style: premium hand-painted miniature enamel and aged copper collectible pins, charming intricate artisanal detail but bold clean silhouettes readable at 56px, restrained antique gold, ivory, muted berry red, slate blue, warm autumn lighting, gentle dimensional shading. NOT flat vector, NOT emoji, NOT generic repeated circular medals. Each pin follows the DISTINCT silhouette of its subject with a narrow copper rim, not the same round border repeated. No text, numbers, letters, captions, logos, watermark, grid lines, or background scenery outside pins. Eight cell subjects in STRICT ROW-MAJOR ORDER, left to right top row, then left to right bottom row:
1. Fifteen crafted items: an old wooden workbench carrying a neatly arranged hand plane, chisel and spool of twine, tabletop silhouette.
2. Fifty crafted items: a compact brick forge furnace with orange glowing coals and a short iron pair of tongs, architectural furnace silhouette.
3. One hundred fifty crafted items: a beautifully restored cream portable radio with copper antenna and one small spanner beside it, no text on radio.
4. Eight collected products: an open apothecary specimen display box with eight distinct colorful small compartments holding seed, feather, shell, herb, berry, metal, wool, fish scale; no writing.
5. Build the idle caretaker post: a cozy tiny watchkeepers hut with a warm lamp and a hanging brass clock showing simple hands, roofed hut silhouette.
6. All-round estate keeper: a prestigious gilded shield quartered with a wheat ear, cream egg, silver fish and little copper rake; a single integrated ornate heraldic crest.
7. Level fifteen homestead: a miniature two-story autumn farmhouse with chimney, amber windows, and a young red-leaved tree beside it, broad detailed architectural pin.
8. Complete three community projects: three warm glowing lanterns hanging together from a beautifully carved wooden crossbeam with a small interlaced ribbon knot, communal celebration pin.
Exactly eight pins. Keep all eight subjects unique and inside their assigned cell. High quality final game artwork.
```
