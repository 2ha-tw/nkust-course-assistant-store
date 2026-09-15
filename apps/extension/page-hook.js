(() => {
  "use strict";
  if (window.__nkustRadarPageHookInstalled) return;
  window.__nkustRadarPageHookInstalled = true;

  const source = "nkust-radar-page-hook";
  const commandSource = "nkust-radar-content";
  const allowedHost = /^aais[0-9a-z-]*\.nkust\.edu\.tw$/i;
  const countPath = "/StdSelcrs/CourseInfo/CourseSelectedNum/SimplifiedCourseSelectionInfo";
  const countPrefix = "/StdSelcrs/CourseInfo/CourseSelectedNum/";
  const quickFilterUnits = new Set(["XB02", "XP00"]);

  const post = (message) => window.postMessage({ source, ...message }, location.origin);
  const validCountUrl = (value) => {
    try {
      const url = new URL(String(value || countPath), location.href);
      return allowedHost.test(url.hostname) && url.origin === location.origin && url.pathname.replace(/\/+$/, "").startsWith(countPrefix);
    } catch {
      return false;
    }
  };

  function authBody(value) {
    const sourceText = String(value || "");
    return /\/(?:Register\/)?Account\/Login(?:[/?#'"\s]|$)/i.test(sourceText)
      || /<title\b[^>]*>[^<]*(?:登入|login)[^<]*<\/title>/i.test(sourceText)
      || (/<form\b[^>]*(?:login|登入)[^>]*>/i.test(sourceText) && /type\s*=\s*["']password["']/i.test(sourceText));
  }

  async function queryCount(message) {
    const requestId = String(message.requestId || "");
    const countId = String(message.countId || "");
    const endpoint = String(message.endpoint || countPath);
    const reply = (ok, responseBody = "", authRequired = false) => post({
      kind: "count-query-result",
      requestId,
      ok,
      authRequired,
      responseBody: String(responseBody || "").slice(0, 200000),
    });
    if (!requestId || !countId || countId.length > 500 || !validCountUrl(endpoint)) {
      reply(false);
      return;
    }
    try {
      const $ = window.jQuery;
      const data = {
        selCrsno: countId,
        selSchoolYear: $ ? $("#SchoolYear").val() || "" : document.querySelector("#SchoolYear")?.value || "",
        selSemester: $ ? $("#Semester").val() || "" : document.querySelector("#Semester")?.value || "",
      };
      if ($?.post) {
        await new Promise((resolve) => {
          const request = $.post(endpoint, data);
          request.done((html) => {
            const body = String(html || "");
            reply(true, body, authBody(body));
            resolve();
          });
          request.fail((xhr) => {
            const body = String(xhr?.responseText || "");
            reply(false, body, Number(xhr?.status) === 401 || Number(xhr?.status) === 403 || authBody(body));
            resolve();
          });
        });
        return;
      }
      const response = await fetch(new URL(endpoint, location.href), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: new URLSearchParams(data).toString(),
      });
      const body = await response.text();
      reply(response.ok && !authBody(body), body, response.status === 401 || response.status === 403 || authBody(body));
    } catch {
      reply(false);
    }
  }

  function changeQuickFilter(message) {
    const unitId = String(message.unitId || "");
    if (!quickFilterUnits.has(unitId)) return;
    const reply = (ok, text = "") => post({ kind: "quick-filter-result", unitId, ok, message: text });
    try {
      const $ = window.jQuery;
      const unit = $("#UnitId").data("kendoDropDownList");
      const year = $("#ClassYear").data("kendoDropDownList");
      const grid = $("#courseGrid").data("kendoGrid");
      if (!unit || !year || !grid) {
        reply(false, "校方查詢元件尚未完成載入");
        return;
      }
      unit.dataSource.filter({});
      unit.dataSource.fetch(() => {
        const exists = Array.from(unit.dataSource.data()).some((item) => String(item.value ?? item.Value ?? "") === unitId);
        if (!exists) {
          reply(false, "目前校區或學制沒有這個課程分類");
          return;
        }
        unit.value(unitId);
        unit.trigger("change");
        if (unitId === "XB02") {
          year.value("");
          year.trigger("change");
        }
        $("#SearchType").val("N");
        grid.dataSource.read();
        reply(true);
      });
    } catch {
      reply(false, "快捷切換失敗，請稍後再試");
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== commandSource) return;
    if (event.data.kind === "count-query") queryCount(event.data);
    if (event.data.kind === "quick-filter") changeQuickFilter(event.data);
  });
})();
