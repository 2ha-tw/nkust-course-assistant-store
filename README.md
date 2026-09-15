# 高科選課助手

高科大選課頁的名額工具，協助你在查詢課程時快速看見即時名額、標記釘選課程，並保留自己的時間篩選。

![高科選課助手 logo](apps/extension/logo.svg)

## 功能界線

工具只讀取資料並更新頁面顯示：

- 顯示「可選」、「已滿」或「名額未知」
- 釘選課程，並在列表上方顯示本學期釘選清單
- 釘選課程在列表中以橘色標記
- 保存每學期的釘選課程與時間篩選
- 提供博雅教育中心與體育課程快捷查詢

工具不會送出加選、不會呼叫加選端點、不會自動登入、不會在背景搶課。

## 安裝

1. 開啟 Chrome 的 `chrome://extensions` 或 Edge 的 `edge://extensions`。
2. 開啟開發人員模式。
3. 選擇「載入未封裝項目」或「載入解壓縮的擴充功能」。
4. 選取本專案的 `apps/extension` 資料夾。

完整使用說明與封裝指令在 apps/extension/README.md。

上架檢查表在 [STORE_SUBMISSION_CHECKLIST.md](STORE_SUBMISSION_CHECKLIST.md)，隱私權說明在 [PRIVACY.md](PRIVACY.md)。

## 專案結構

`apps/extension` 是不需要編譯的 Manifest V3 擴充功能：

- `manifest.json`：名稱、權限與頁面注入設定
- `content.js`：名額顯示、釘選與篩選保存
- `page-hook.js`：固定名額查詢與快捷查詢
- `styles.css`：頁面樣式
- `logo.svg`：橘色品牌向量圖
- `icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`：瀏覽器與商店圖示
- `store-assets/icon300.png`：Edge 商店建議尺寸圖示

資料只保存在瀏覽器本機。使用前請確認高科大當期選課規範與網站條款。
