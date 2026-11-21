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

路綫是按官方車站順序把站與站連起來，用來辨認路綫，不是實測路軌。瀏覽器直接向官方網址讀取到站資料和快拍，網頁本身不代為轉發。

## 驗收後才發佈到 Cloudflare

現階段只在開發環境預覽，尚未發佈。驗收通過後，用 Cloudflare Workers 免費方案和平台提供的 `workers.dev` 網址：

```bash
npm run build
npx wrangler deploy
```

發佈前請確認：

- 帳戶停留在 Workers 免費方案，不要升級每月 5 美元的付費方案。
- 不要開啟 Workers Caching。官方說明指出，開啟後靜態檔的快取請求也會計入 Worker 請求。
- 不要購買自訂網域。網址會是 `hk-smart-city-map.<帳號>.workers.dev`。
- 這個設定只上傳 `dist` 裡的靜態檔。靜態請求不計次數，也不另收儲存費。課堂使用預計費用是 0 美元。

`workers.dev` 網址是公開的，知道連結的人都能打開。
