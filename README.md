# Faro 的旅行

个人旅行主页：https://sangi9faro.github.io/

| 文件 | 作用 |
|---|---|
| `index.html` | 主页：统计、足迹地图、即将出发、旅行记录 |
| `trip.html` | 通用详情页，`trip.html?id=<旅行 id>` |
| `trips.json` | 所有旅行的数据（只有自己能改） |
| `taipei/` | 台北圣诞行攻略页 |
| `img/` | 封面图（1200px 宽、200KB 以内） |

状态（计划中 / 进行中 / 已完成）不存，按今天的日期和 `start` / `end` 自动算。
想预览别的日期：在网址后面加 `?today=2027-01-01`。

## 加一次过去的旅行
1. 封面压缩到 1200px 宽、200KB 以内，放进 `img/`。
2. 在 `trips.json` 的 `trips` 里加一条，`site` 写 `null`。
3. 详情用 `days`（按天的地点，格式见示例）、`notes`（游记，空一行分段）、`links`（`{ "title", "url" }`）。
4. 不写任何人的真实姓名和航班号，`members` 只写人数。
5. 替换掉 `example-past` 这条示例。

## 加一次新的大旅行（要投票、记账、在线编辑行程）
复制 `vietnam-trip` 仓库作为模板，然后在 `trips.json` 里加一条，`site` 填对应链接。

> ⚠️ 待办（第二次大旅行之前必须做）：越南网站的数据直接存在 Firebase 项目 `vietnam-trip-10761`
> 的顶层集合（`days`、`expenses`、`checklist`、`links`、`polls`……）。新旅行如果用同一个项目，
> 数据会和越南的混在一起。二选一：
> - 把数据路径改成按旅行区分，例如 `trips/{tripId}/days`，同时改 `firestore.rules`；
> - 或者给新旅行单独建一个 Firebase 项目。
