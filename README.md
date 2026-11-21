# 香港智慧城市地圖

一幅可互動的香港地圖。底圖使用 [OpenFreeMap](https://openfreemap.org/) 的免費公開服務。地圖上有十條港鐵重鐵綫，以及運輸署的交通快拍點。

- 點選車站，查看該站即將到站的班次，最多四班。
- 點選快拍點，查看該處最新路面照片。
- 沒有班次、照片或網路失敗時，側欄會直接說明。

## 在自己的電腦運行

需要 Node.js 22.12.0 或更新版本。

```bash
npm install
npm run dev
```

瀏覽器打開 `http://127.0.0.1:4179`。

若要重新下載車站座標：

```bash
npm run prepare-data
```

這個指令會讀取港鐵車站名單和地政總署的車站範圍，寫入 `public/data/network.json`。馬場站不在車站名單檔內，程式會按到站代碼 `RAC` 補上。

## 資料從哪裡來

| 畫面 | 來源 |
| --- | --- |
| 底圖 | OpenFreeMap Bright，`https://tiles.openfreemap.org/styles/bright` |
| 車站名稱和順序 | 港鐵公開資料 `mtr_lines_and_stations.csv` |
| 車站位置 | 地政總署港鐵站範圍，建立時轉成每個站一個點 |
| 到站班次 | `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php` |
| 快拍位置和照片 | 運輸署交通情況快拍圖像 |

路綫形狀來自 OpenStreetMap 的港鐵路軌，車站位置仍來自地政總署。快拍名單打包在 `public/data/cameras.json`，照片仍在點開時向運輸署讀取。放大到街道範圍後，地圖按到站時間在路軌上估算列車位置，並非即時定位。

`public/runtime.json` 的 `trainSnapshotUrl` 若是一個 `https` 網址，所有訪客讀同一份全港快照。這個網址留空時，每人放大後約每 30 秒直接查詢畫面內最多 12 個車站。快照連續兩次讀不到，才退回這 12 次查詢。到站之後，列車按同樣速度繼續沿路軌走，不會停在月台。

## Cloudflare Workers

地圖靜態檔和列車快照都在這個帳戶的 `hkcitymap.workers.dev`。

- 地圖：`https://hk-smart-city-map.hkcitymap.workers.dev`
- 列車快照：`https://hk-train-snapshot.hkcitymap.workers.dev/trains.json`

快照存在 Workers KV。每次更新都一次過查完全部車站路綫，再寫成一份檔。免費方案每天大約 1,000 次寫入，所以完整更新大約每 2 分鐘一次。每位放大看列車的訪客，大約每分鐘向這個 Worker 讀一次，計入每天 100,000 次的免費額度。

帳戶目前沒有自己的網域，也未開啟 R2。人數大到每天超過 10 萬次讀取時，才需要把快照放到自己的網域後面做邊緣快取。那一步要 Workers 付費方案，最低每月 5 美元。

```bash
npm run build
npx wrangler@4 deploy
cd snapshot
npx wrangler@4 deploy
```
