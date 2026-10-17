# 收藏的「从截图添加」中转服务（Cloudflare Worker）

网页不能直接放 API 密钥（仓库和网页都是公开的），所以识别和找坐标都在这个 Worker 里做，密钥只存在 Cloudflare 的 secret 里。
全部用免费额度，**所有账号都不绑银行卡**：超出免费额度时服务只会暂时报错（网页提示「今天的免费识别次数用完了」），不会扣费。

| 接口 | 做什么 | 用到的服务 |
|---|---|---|
| `POST /recognize` | 一张截图 → 店名、地址、类型、城市 + 最多 3 个候选坐标 | Gemini 免费层 + 下面三个 |
| `POST /recognize-text` | 分享链接 / 文字 → 同上 | 同上 |
| `POST /search` | 粘贴店名 → 最多 5 个位置（不用 AI，额度用完也能用） | 韩国 Kakao、中国大陆高德、其他 OpenStreetMap |

只接受来自 `https://sangi9faro.github.io` 的请求，并且必须带主人账号的 Firebase 登录凭证，别人知道地址也用不了。AI 识别每天最多 50 次（`wrangler.toml` 里的 `DAILY_LIMIT`）。

## 第一次部署（大约 20 分钟）
1. **Cloudflare**：在 https://dash.cloudflare.com/sign-up 注册（免费，不绑卡）。
2. **Gemini 密钥**：打开 https://aistudio.google.com/apikey → Create API key。项目不要关联结算账号。
3. **Kakao 密钥**：https://developers.kakao.com → 我的应用 → 添加应用 → 应用密钥里的 **REST API 密钥**。在「产品设置 → 카카오맵」里打开「使用」。
4. **高德密钥**：https://console.amap.com → 应用管理 → 创建应用 → 添加 Key，服务平台选 **Web 服务**。
5. 在终端里：
   ```bash
   cd ~/Desktop/旅行/sangi9faro.github.io/worker
   npm install
   npx wrangler login                       # 浏览器里点授权
   npx wrangler kv namespace create USAGE   # 把输出里的 id 填进 wrangler.toml 的 REPLACE_WITH_KV_ID
   npx wrangler secret put GEMINI_API_KEY   # 每条都会提示粘贴密钥，粘贴后回车
   npx wrangler secret put KAKAO_REST_KEY
   npx wrangler secret put AMAP_KEY
   npx wrangler secret put CONTACT_EMAIL    # 你的邮箱，只发给 OpenStreetMap，遵守它的使用规定
   npx wrangler deploy
   ```
6. 最后一行会打印网址，形如 `https://faro-favorites.<你的子域>.workers.dev`。把它发给 Claude，填进 `fav/add.js` 的 `WORKER` 后推送，收藏页的「从截图添加」就能用了。

**密钥不要写进任何文件，也不要发在聊天里**；只通过 `wrangler secret put` 粘贴。

## 以后要改的
- Google 换了免费模型的名字：改 `wrangler.toml` 里的 `GEMINI_MODEL`，再 `npx wrangler deploy`。
- 免费额度和价格以各家官网为准：Gemini（ai.google.dev/pricing）、Cloudflare Workers（每天 10 万次请求）、Kakao 本地 API、高德 Web 服务。
- Gemini 免费层的条款允许 Google 用上传内容改进产品：有聊天记录或个人信息的截图先裁剪（网页上传前会提示）。

## 本地测试
```bash
npm test     # 坐标转换、登录校验、限额、各国找坐标的单元测试（不联网）
```
高德返回的是 GCJ-02（火星坐标），Worker 会转换成地图用的 WGS-84，测试里验证往返误差小于 1 米。
