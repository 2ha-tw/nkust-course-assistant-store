# 高科選課助手

高科大選課頁的 Chrome／Edge Manifest V3 擴充功能。它把即時名額、釘選課程和常用查詢整合在目前的加選課程頁，方便你自己判斷要不要按校方提供的按鈕。

## 功能

- 在課程列顯示 `可選 selected/limit`、`已滿 selected/limit` 或 `名額未知`
- 每次查詢、換頁或頁面刷新後重新取得名額
- 釘選課程依學期保存
- 本學期有釘選課程時，在課程列表上方顯示課號、課名與名額卡片
- 即使目前篩選結果沒有釘選課程，仍會在上方更新它的即時名額
- 釘選課程在列表中以橘色標記
- 保存每學期的上課時間篩選
- 提供「博雅教育中心」與「體育課程」快捷查詢；體育查詢會保留目前年級
- 支援 `aais1`、`aais3`、`aais4`、`aais5`、`aaisx` 等高科大分流

## 功能界線

這個版本只處理名額顯示、釘選與查詢。程式碼中沒有加選端點、加選訊息處理器、背景 service worker、登入 hook 或自動登入流程。

擴充功能不會：

- 自動按校方的 Add 按鈕
- 送出任何加選請求
- 監看名額後替你重試加選
- 在背景分頁或 service worker 執行工作
- 保存帳號、密碼或 Cookie
- 把資料上傳到第三方服務

要真正加選，請使用校方頁面原本的操作。

## 安裝

### Chrome

1. 開啟 `chrome://extensions`
2. 開啟「開發人員模式」
3. 選擇「載入未封裝項目」
4. 選取專案的 `apps/extension` 資料夾
5. 回到高科大加選課程頁並重新整理

### Edge

1. 開啟 `edge://extensions`
2. 開啟「開發人員模式」
3. 選擇「載入解壓縮的擴充功能」
4. 選取專案的 `apps/extension` 資料夾
5. 回到高科大加選課程頁並重新整理

## 使用方式

1. 先以一般方式登入高科大，進入「加選課程」頁。
2. 查詢課程後，在課程列查看名額狀態。
3. 按課程名稱旁的「釘選」加入清單。釘選後，課程會被橘色標記，並出現在列表上方的釘選清單。
4. 點擊上方釘選清單中的課程，可回到該課程列。
5. 開啟上課時間選擇器後，按「套用上次選課篩選」還原本學期保存的條件。
6. 查詢通識或體育時，使用快捷按鈕再執行校方查詢。

## 名額判斷

工具只比較校方回傳的「已選上人數」與「限修人數」：

- 已選上人數小於限修人數：可選
- 已選上人數大於或等於限修人數：已滿
- 缺少任一數字：名額未知

名額未知可能是登入逾時、校方元件尚未載入、服務忙碌或回應格式改變。這種狀態不會觸發任何加選動作。

## 權限與資料

`manifest.json` 只有：

- `storage`：保存釘選課程與時間篩選在瀏覽器本機
- 高科大加選頁的 host permission：讓工具只在指定頁面執行

名額查詢沿用目前分頁的登入工作階段。工具不會保存或讀取你的密碼，也不會把資料送到外部服務。

## 原始碼與封裝

```text
apps/extension/
├── manifest.json
├── content.js
├── page-hook.js
├── logo.svg
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── styles.css
└── README.md
```

修改後，到擴充功能管理頁按「重新載入」，再重新整理校方頁面。

macOS／Linux 封裝：

```bash
cd apps/extension
zip -r ../../nkust-course-assistant-extension-0.4.7.zip manifest.json content.js page-hook.js logo.svg icons styles.css README.md
```

Windows PowerShell：

```powershell
Compress-Archive -Path manifest.json,content.js,page-hook.js,logo.svg,icons,styles.css,README.md -DestinationPath ..\\..\\nkust-course-assistant-extension-0.4.7.zip -Force
```

## 開發檢查

```bash
node --check apps/extension/content.js
node --check apps/extension/page-hook.js
node -e 'JSON.parse(require("fs").readFileSync("apps/extension/manifest.json"))'
```

使用前請確認高科大當期選課規範與網站條款。本工具不是校方官方服務。
