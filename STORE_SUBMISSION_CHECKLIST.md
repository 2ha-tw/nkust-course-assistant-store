# 商店上架檢查表

目前封裝版本：`0.4.7`

## 已完成的封裝檢查

- [x] Manifest V3
- [x] `name`、`version`、`description` 已填寫
- [x] Chrome manifest description 少於 132 字元
- [x] `icons` 已註冊 16、32、48、128 PNG
- [x] `action.default_icon` 已註冊 16、32、48、128 PNG
- [x] ZIP 根目錄直接包含 `manifest.json`
- [x] 沒有遠端程式碼、背景 service worker、登入 hook 或加選端點
- [x] 權限只有 `storage` 與指定的高科大加選頁 host permission
- [x] 說明文件與隱私權說明已放入專案

## Chrome Web Store 提交時要填

1. 建立或登入 Chrome Web Store Developer Dashboard。
2. 上傳 `nkust-course-assistant-extension-0.4.7.zip`。
3. Store Listing 填名稱、摘要、完整說明、語言與商店圖示；可補上課程頁操作截圖。
4. Privacy 填單一用途、`storage` 與高科大頁面權限用途、資料使用聲明與 Limited Use 認證。
5. Distribution 選擇地區與發布方式。
6. 若審查需要登入，提供只供審查的測試步驟與測試帳號，不要提供個人主要帳號。
7. 提交審查；確認通過後再選擇立即發布或延後發布。

官方文件：

- https://developer.chrome.com/docs/extensions/develop/ui/configure-icons
- https://developer.chrome.com/docs/webstore/prepare
- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/program-policies/user-data

## Microsoft Edge Add-ons 提交時要填

1. 建立或登入 Microsoft Partner Center 的 Edge 開發者帳號。
2. 上傳同一份 ZIP，確認 Manifest V3 與 Chrome 測試結果一致。
3. Availability 填可用市場與顯示方式。
4. Properties 填網站、支援聯絡方式與內容分級。
5. Privacy 填單一用途、權限理由、遠端程式碼、資料使用與隱私權 URL。
6. Store listings 至少填一種語言的名稱與短描述；每種語言都要有完整描述與圖示。
7. 完整描述至少 250 字元；商店圖示需 1:1，最低 128×128，建議使用 `store-assets/icon300.png`。
8. Certification notes 寫明測試入口、需要先登入高科大，以及工具只顯示名額與保存釘選資料。
9. 提交認證，等待 Microsoft 審查。

官方文件：

- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/add-ons-curation

## 目前仍需人工準備

- Chrome Web Store Developer Dashboard 與 Edge Partner Center 帳號驗證。
- 商店頁的完整描述、支援聯絡方式與發布地區。
- 課程頁操作截圖；Edge 可使用 640×480 或 1280×800，最多 6 張。
- Edge 的隱私權 URL 可使用本專案的 `PRIVACY.md` 公開頁面：
  https://github.com/2ha-tw/nkust-course-assistant-store/blob/main/PRIVACY.md

## 專案歷史

商店用程式已移到乾淨的新專案：

https://github.com/2ha-tw/nkust-course-assistant-store

舊專案仍保留原歷史，不能再拿來作為商店提交來源。
