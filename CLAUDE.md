# 项目说明（给 Claude Code）

这是 Faro 的个人旅行网站，托管在 GitHub Pages，数据在 Firebase（项目 `vietnam-trip-10761`）。

## 两个仓库
- `sangi9faro.github.io`：主页（我的旅行）、`trip.html`、`favorites.html`，旅行列表在 `trips.json`。
- `vietnam-trip`：越南跨年的攻略（`guide.html`）、工具箱 / 账单 / 行李（`index.html`）、投票（`vote.html`）。**整个 Firebase 项目唯一的 `firestore.rules` 在这里。**

## 必须遵守
1. 仓库是公开的：**代码里不能出现任何真实姓名、航班预订码、API 密钥**。成员用 m1–m4，名字从 Firestore 读取；密钥只放在 Cloudflare Worker 的 secret 里。
2. 只改外观时，不改数据结构、Firestore 规则、元素 id 和功能。
3. 颜色、字体、间距、图标都用 `ui.css` 里的 token 和 Lucide 图标，不引入新颜色和字体，不用 emoji 当图标。两个仓库的 `ui.css` 必须保持一致。
4. 手机（< 768px）和电脑（≥ 1200px）是两套布局；改一边时要确认另一边没有被影响。
5. 不用 `confirm()` / `alert()`；删除在页面上二次确认。
6. `localStorage` 读写都要包在 try/catch 里。
7. 另一个 Claude Code 窗口可能在同时改另一个仓库：开始前先 `git pull`，只改分配给你的仓库；需要改 `firestore.rules` 但不在 vietnam-trip 仓库时，把改动写进 `rules-favorites.txt`，不要直接改。
8. 每完成一项就 commit + push。涉及界面的，用无界面 Chrome 截图（手机 390px、电脑 1440px，浅色和深色）给 Faro 看。
9. 规则有改动时，最后提醒 Faro 发布（`firebase deploy --only firestore:rules`）。
10. 用中文和 Faro 沟通，解释要简短。

## 时间
台北 12/25 出发，越南 12/29 出发。大改动要在 12/10 前完成，之后只修 bug。

## 更多背景
完整的项目总览、设计规范和指令历史，在 Faro 的 Claude Project「旅行网站」里（`00-项目总览.md` 等文件）。
