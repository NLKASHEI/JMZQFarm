# 配图来源与提示词

## 切片修订

实际使用 sprites-v2.webp。旧图的鹅头、羊角等进入邻格，现重新生成留白图集，并按实际像素位置取样，不能假设生图结果严格等分。

每列取样宽256像素，列起点0/256/512/768/1024/1280；每行取样高256像素，行起点24/256/488/728。保留完整动物，不取到相邻行。前端通过CSS取样，不重绘图案。

编辑提示词：

Use case: precise-object-edit.
Image 1 is the edit target: an existing pixel-art game sprite atlas. Preserve the same 24 subjects, exact row-major order, warm parchment backdrop and detailed pixel-art style. Change ONLY the spacing and alignment, to eliminate adjacent sprite bleed when sliced by code.

Critical production layout: canvas exactly 1536x1024, an exact 6 columns by 4 rows grid of 256x256 pixel cells. NO visible grid. Each subject, including its shadow, MUST be fully inside a centered 160x160 safe box within its own cell. This leaves at least 48px of EMPTY BACKGROUND on all four sides of EVERY cell. It is okay to make the subjects SMALLER than in the input; padding is more important than filling the canvas. All subjects centered on mathematically exact centers: x=128,384,640,896,1152,1408; y=128,384,640,896. No subject crossing ANY cell boundary. No large horns, ears, tails, leaves, shadows or grain debris beyond the central safe box. No floating fragments. Do not let the goose's head appear in the chicken's cell or the goat appear in the duck's cell.
Use one perfectly flat, solid #e8dfcf background across the whole image, not a gradient.

The existing order must remain exactly:
Row1 potatoes / cabbage / carrots / red chilies / tomatoes / corn.
Row2 wheat bundle / pumpkin / green beans / strawberries / rice bundle / medicinal herbs.
Row3 white rabbit / brown chicken / duck / sheep / pink pig / chestnut horse.
Row4 black-white cow / white goose / brown goat / bare soil patch / seedling on soil / wooden feed trough.
All subjects complete, no cut-off body parts. No writing, labels, numbers, UI, borders or watermarks. Keep these as raster pixel-art assets, not vector art.

使用内置 imagegen 工具生成，随后用 Sharp 编码为 WebP，仅做格式压缩。PNG 为生成原稿；界面使用 WebP。图片内不含界面文字，标题和操作由 HTML 渲染，适配亮暗两种风格。

图集按等分单元在 CSS 中显示，不使用 SVG 绘制替代配图。

## farm

Use case: stylized-concept. Asset type: raster game environment background for an interactive cozy survival farm, NOT a UI mockup.
Primary request: a beautiful handcrafted pixel-art small rural homestead at the edge of an abandoned Chinese town, hopeful quiet life after collapse. Landscape 1536x1024. High oblique top-down view, sophisticated 32-bit pixel-art with crisp clusters, warm amber cottage windows, clay tile roofs, weathered timber, rich earth, slate blue water, desaturated foliage, warm autumn sunlight. Not dark green overall, not vector, not flat icon art.
Composition for actual clickable building overlays: modest cottage centered around 25% across / 30% down; small workshop on the far right around 78% / 34%; vegetable beds bottom-left around 28% / 70%; fenced chicken and sheep paddock bottom-center around 54% / 69%; pond and short wooden fishing pier on right around 85% / 73%; footpath exits top-center around 55% / 18%. All zones clearly separated and large enough to recognize when displayed 600px wide. Enough small believable details: water barrel, stacked firewood, laundry, stepping-stones, red-orange pumpkins. Gentle human-scale lived-in mood, no humans required. Entire farm fills the frame without empty border. No writing, no UI, no lettering, no symbols, no watermark. Original game art.

## scenes

Use case: stylized-concept. Asset type: one game environment texture atlas, raster pixel art, six rectangular backgrounds in an exact 2-column by 3-row edge-to-edge equal grid. Landscape 1536x1024 so each tile is 768x341. No gaps, no borders, no frames, no text anywhere.
Style consistent across all tiles: detailed cozy survival pixel art, crisp painterly pixel clusters, earthy warm neutrals, amber highlights and slate blue water, not vector, not flat geometric icons.
Tile order strictly row-major:
Top left: quiet river fishing spot, near-bank reeds, small wooden dock and fishing bucket, wide blue river with ripples, warm afternoon.
Top right: autumn woodland exploration, narrow winding path between pale birch trunks, abandoned hunter's hut in distance, wild berries, soft mist.
Middle left: deserted town street, old Chinese shopfronts with NO legible signs, rusty bicycle and scattered wooden crates, autumn late afternoon.
Middle right: flooded abandoned shopping arcade interior, shallow blue water and broken skylight, rusted railings, boxes on dry shelves, evocative quiet.
Bottom left: abandoned research outpost corridor, old unpowered equipment, gray-blue cabinets and copper pipes, slightly dusty sunbeams, no horror creatures.
Bottom right: cozy wooden crafting workshop interior, workbench with jars, herbs hung to dry, tool pegboard, warm window light and stacked supplies.
These are production-ready scene backgrounds to crop each exact cell for a farm game's tabs. No UI, no labels, no watermark, no characters.

## sprites

Use case: stylized-concept. Asset type: one item and animal sprite atlas for a farm game. Raster crisp detailed pixel art. Exact 6 columns x 4 rows of equal square cells, 1536x1024 total. All cells share a flat warm pale parchment background #e8dfcf, NO grid lines, NO outlines around cells, NO text or numbers. One centered subject in every cell with generous 15% padding so no subject crosses into adjacent cells. Consistent 3/4 top-down pixel-art perspective, warm subtle shading and small grounded shadow, readable at 48px, not vector, not emoji. Crops depicted as harvested produce; animals cute but anatomically recognizable, complete bodies.
Strict left-to-right row-major subjects:
ROW 1: two potatoes; a green cabbage; three carrots; red chili peppers; tomatoes; yellow corn cob.
ROW 2: bundle of ripe wheat; orange pumpkin; green beans; strawberries; bundle of rice stalks with rice grains; bundle of medicinal leafy herbs.
ROW 3: white rabbit; brown chicken; duck; fluffy sheep; pink pig; chestnut horse.
ROW 4: black-and-white cow; white goose; brown goat; small tilled empty soil patch; small green seedling growing from soil; wooden feed trough filled with golden hay.
Do not skip or repeat cells. No badges, no numerals, no lettering, no UI. Charming handmade pixel detail, not glossy 3D.
