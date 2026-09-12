# 秋日成就册配图

使用内置 imagegen 生成。原稿：`v4.2/medals.png`，交付：`v4.2/medals.webp`（1536×1024，约225KB）。沿用资源目录，不覆盖旧配图；发布时由不可变提交锁定。

图集按3列2行取样，每格512×512；顺序为种植、牧场、垂钓、探索、工坊、经营。所有徽章完整保留在各自单元内。UI 使用独立剪裁容器，六类共享一张图片、一次下载；分类序号和文字标明具体成就，不将同类不同成就混为一项。

## 最终生成提示词

```text
Use case: stylized-concept. Asset type: a polished raster achievement medal atlas for a cozy autumn survival farming game. One landscape image exactly 1536x1024, a precise 3-column by 2-row grid of six equal 512px square cells with no grid lines.
Create six beautiful, distinctive collectible illustrated medals. Hand-painted miniature enamel and aged copper badges with finely crafted pixel-art edges and warm dimensional shading, premium game inventory art, readable at 48px, NOT emoji, NOT flat vector icon, NOT shiny plastic. Use restrained antique gold, copper, cream, muted berry-red and slate-blue enamel. Uniform perfectly flat pale parchment background #e8dfcf. Every complete badge including its shadow must stay within a centered 300x300px safe area in its 512x512 cell, leaving at least 106px blank background on each side. Plenty of separation. No fragments of neighboring objects.
Row-major order strictly:
Top-left agriculture: an ornate copper round medal framing golden wheat, a small red strawberry and a tiny leaf, rich amber enamel.
Top-middle ranching: a softly scalloped bronze medal framing a gentle white sheep with a little brass bell, creamy enamel.
Top-right fishing: an oval silver-copper medal framing a gleaming silver carp leaping over a dark-blue ripple with one tiny fishing hook, elegant blue enamel.
Bottom-left exploration: a weathered compass rose medallion framing a lantern and distant mountain path, deep slate-blue and amber enamel.
Bottom-middle crafting: a hexagonal copper medal framing a carefully modeled small hammer, spanner and glowing amber workshop window motif.
Bottom-right homestead/community: a golden wreath medal framing a warm-lit tiny tiled-roof cottage and two autumn leaves, soft red-brown enamel.
All six distinct, same visual family, physically plausible charming craftwork, refined silhouettes, central subject clearly distinguishable, straight-on camera. No text, letters, digits, ribbons with writing, UI labels, logos or watermark. Do not fill the blank gutters.
```
