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

`public/runtime.json` 的 `trainSnapshotUrl` 若是一個 `https` 網址，所有訪客約每分鐘讀同一份全港快照。這個網址留空時，每人放大後約每 30 秒直接查詢畫面內最多 12 個車站。快照連續兩次讀不到，才退回這 12 次查詢。

## 全港列車快照

`snapshot/` 是獨立的定時程式，大約每分鐘向港鐵查完全部車站路綫，把結果寫進 R2 的 `trains.json`。地圖網站本身保持靜態，不代為轉發。

這條路要一份你擁有的網域，以及 Cloudflare Workers 付費方案。付費方案最低每月 5 美元。請在帳戶把超額消費上限設為 0，避免人數上升時自動加價。網域費用是註冊商的年費。R2 每月寫入約 4 萬次，在免費額以內。

`workers.dev` 和 `r2.dev` 每個訪客的讀取都會計費。網域要接到 R2，並加一條快取規則，把 `trains.json` 在邊緣快取 60 秒。JSON 預設不會被快取。不要開啟 Workers Caching，開啟後每次讀取都會計入 Worker 費用。

免費方案每次最多 50 個對外請求，不足以一次查完約 121 個車站路綫，所以這個程式要用付費方案。

```bash
node scripts/build-pairs.mjs
cd snapshot
npx wrangler@4 login
npx wrangler@4 r2 bucket create hk-train-snapshot
npx wrangler@4 r2 bucket cors set hk-train-snapshot --file cors.json --force
npx wrangler@4 deploy
```

部署後，在 R2 的桶接上你的網域，快取規則選「符合快取」並把邊緣快取時間設為 60 秒。然後把 `https://你的網域/trains.json` 寫進 `public/runtime.json`，再重新發佈地圖。

本機可以先跑一輪，看看快照內容：

```bash
npm run snapshot -- /tmp/trains.json
```
