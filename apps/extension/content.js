(() => {
  "use strict";
  if (!/^aais[0-9a-z-]*\.nkust\.edu\.tw$/i.test(location.hostname)) return;

  const STORAGE_KEY = "nkustRadarPinnedBySemester";
  const FILTER_KEY = "nkustRadarTimeFiltersBySemester";
  const COUNT_ENDPOINT = "/StdSelcrs/CourseInfo/CourseSelectedNum/SimplifiedCourseSelectionInfo";
  const COUNT_PREFIX = "/StdSelcrs/CourseInfo/CourseSelectedNum/";
  const COURSE_GRID = "#courseGrid";
  const latestResults = new Map();
  const inFlight = new Map();
  const pendingCountQueries = new Map();
  let pinnedBySemester = {};
  let timeFiltersBySemester = {};
  let currentSemester = "未知學期";
  let gridSignature = "";
  let updateTimer = 0;
  let updateGeneration = 0;
  let updating = false;
  let pendingUpdate = false;
  let pinnedRefreshing = false;
  let filterSaveTimer = 0;
  let quickFilterTimer = 0;

  const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const safeCountEndpoint = (value) => {
    try {
      const url = new URL(String(value || COUNT_ENDPOINT), location.href);
      const path = url.pathname.replace(/\/+$/, "");
      if (url.origin !== location.origin || !path.startsWith(COUNT_PREFIX)) return COUNT_ENDPOINT;
      return `${url.pathname}${url.search}`;
    } catch {
      return COUNT_ENDPOINT;
    }
  };
  const safeStorageGet = async (key) => {
    try {
      return await chrome.storage.local.get(key);
    } catch {
      return {};
    }
  };
  const safeStorageSet = async (value) => {
    try {
      await chrome.storage.local.set(value);
    } catch {}
  };

  function detectSemester() {
    const body = document.body?.innerText || document.title || "";
    const compact = body.match(/(?:^|[^\d])(\d{3}-\d)(?!\d)/);
    if (compact) return compact[1];
    const labelled = body.match(/(?:^|[^\d])(\d{3})\s*學年(?:度)?\s*第?\s*(\d)\s*學期/);
    return labelled ? `${labelled[1]}-${labelled[2]}` : "未知學期";
  }

  function normaliseKey(value) {
    return String(value || "").toLowerCase().replace(/[\s_\-:：]/g, "");
  }

  function numberAfterLabel(value, pattern) {
    const match = String(value || "").match(new RegExp(`${pattern}[^0-9]{0,24}(\\d+)`, "i"));
    return match ? Number(match[1]) : null;
  }

  function countsFromObject(value) {
    const result = { limit: null, selected: null };
    const visit = (node) => {
      if (node == null || (result.limit != null && result.selected != null)) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== "object") return;
      Object.entries(node).forEach(([key, child]) => {
        const normal = normaliseKey(key);
        const numeric = typeof child === "number" ? child : /^\d+$/.test(String(child)) ? Number(child) : null;
        if (numeric != null && result.limit == null && /限修|limit|capacity|max(?:imum)?|quota/.test(normal)) result.limit = numeric;
        if (numeric != null && result.selected == null && /已選|selected|enroll(?:ed)?|current|choose(?:d)?/.test(normal)) result.selected = numeric;
        visit(child);
      });
    };
    visit(value);
    return result.limit != null && result.selected != null ? result : null;
  }

  function parseCounts(value) {
    if (!value) return null;
    const source = String(value);
    try {
      const parsed = countsFromObject(JSON.parse(source));
      if (parsed) return parsed;
    } catch {}
    const readable = source
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&#x([0-9a-f]+);?/gi, (_match, hex) => {
        try { return String.fromCodePoint(Number.parseInt(hex, 16)); } catch { return " "; }
      })
      .replace(/&#(\d+);?/g, (_match, decimal) => {
        try { return String.fromCodePoint(Number.parseInt(decimal, 10)); } catch { return " "; }
      });
    const limit = numberAfterLabel(readable, "(?:限修人數|限修|Limit(?:Count|ed)?|Capacity)");
    const selected = numberAfterLabel(readable, "(?:已選上人數|已選人數|已選|Selected(?:Count)?|Enrolled)");
    return limit != null && selected != null ? { limit, selected } : null;
  }

  function getRows() {
    return Array.from(document.querySelectorAll(`${COURSE_GRID} tbody tr`)).filter((row) => row.querySelector("button.addbutton,[data-id]"));
  }

  function rowColumns(row) {
    const cells = Array.from(row.querySelectorAll("td"));
    const firstVisible = cells.length >= 10 ? 2 : 1;
    return {
      cells,
      crsno: cells[firstVisible],
      name: cells[firstVisible + 1],
      className: cells[firstVisible + 4],
      teacher: cells[firstVisible + 6],
    };
  }

  function getCourseFromRow(row) {
    const courseNode = row.querySelector("button.addbutton,[data-id]");
    const columns = rowColumns(row);
    const id = text(courseNode?.getAttribute("data-id") || courseNode?.dataset?.id);
    if (!id || !columns.name) return null;
    const nameCell = columns.name;
    const nameLink = nameCell.querySelector("a");
    const countTrigger = nameCell.querySelector(".selcrsnum,[title*='選課人數'],[aria-label*='選課人數']");
    const subjectName = text(nameLink?.textContent || nameCell.textContent).replace(//g, "").trim().split("\n")[0];
    const course = {
      id,
      countId: text(countTrigger?.getAttribute("data-id") || countTrigger?.dataset?.id) || id,
      countEndpoint: safeCountEndpoint(document.querySelector("#selcrsNumDialog")?.getAttribute("data-url")),
      semester: currentSemester,
      crsno: text(columns.crsno?.textContent),
      subjectName,
      courseClassName: text(columns.className?.textContent),
      teacherText: text(columns.teacher?.textContent),
    };
    return course.crsno ? course : null;
  }

  function allPinned() {
    return Object.values(pinnedBySemester).flatMap((items) => Array.isArray(items) ? items : []);
  }

  function pinnedKey(course) {
    return `${course.semester}:${course.id}`;
  }

  function isPinned(course) {
    return allPinned().some((item) => pinnedKey(item) === pinnedKey(course));
  }

  async function persistPins() {
    await safeStorageSet({ [STORAGE_KEY]: pinnedBySemester });
  }

  async function togglePin(course) {
    const items = Array.isArray(pinnedBySemester[course.semester]) ? [...pinnedBySemester[course.semester]] : [];
    const index = items.findIndex((item) => item.id === course.id);
    if (index >= 0) items.splice(index, 1);
    else items.push({ ...course });
    if (items.length) pinnedBySemester[course.semester] = items;
    else delete pinnedBySemester[course.semester];
    await persistPins();
    decorateRows();
    renderPinnedSummary();
  }

  async function saveTimeFilters() {
    const inputs = Array.from(document.querySelectorAll('input[name="CheckTime"]'));
    if (!inputs.length) return;
    timeFiltersBySemester[currentSemester] = inputs.filter((input) => input.checked).map((input) => input.value);
    await safeStorageSet({ [FILTER_KEY]: timeFiltersBySemester });
    renderTimeFilterControls();
  }

  function scheduleSaveTimeFilters() {
    window.clearTimeout(filterSaveTimer);
    filterSaveTimer = window.setTimeout(() => void saveTimeFilters(), 60);
  }

  function restoreTimeFilters() {
    const inputs = Array.from(document.querySelectorAll('input[name="CheckTime"]'));
    if (!inputs.length || !Object.prototype.hasOwnProperty.call(timeFiltersBySemester, currentSemester)) return;
    const saved = new Set(Array.isArray(timeFiltersBySemester[currentSemester]) ? timeFiltersBySemester[currentSemester] : []);
    inputs.forEach((input) => {
      input.checked = saved.has(input.value);
    });
  }

  function renderTimeFilterControls() {
    const container = document.querySelector("#select_time");
    if (!container || !container.querySelector('input[name="CheckTime"]')) return;
    let button = container.querySelector("#nkust-radar-apply-filters");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.id = "nkust-radar-apply-filters";
      button.textContent = "套用上次選課篩選";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        restoreTimeFilters();
        button.textContent = "已套用上次選課篩選";
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = "套用上次選課篩選";
        }, 1200);
      });
      const clear = container.querySelector("#btnClearAll");
      if (clear?.parentElement) clear.parentElement.appendChild(button);
      else container.appendChild(button);
    }
    button.disabled = !Object.prototype.hasOwnProperty.call(timeFiltersBySemester, currentSemester);
    button.title = button.disabled ? "尚未保存這個學期的篩選" : "將保存的上次篩選套用到目前選擇器";
  }

  function resetQuickFilterButtons(message = "") {
    document.querySelectorAll(".nkust-radar-quick-filter").forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = button.dataset.label;
      if (message) button.title = message;
    });
  }

  function handleQuickFilterResult(result) {
    window.clearTimeout(quickFilterTimer);
    const active = document.querySelector(`.nkust-radar-quick-filter[data-unit-id="${result.unitId}"]`);
    resetQuickFilterButtons(result.message || "");
    if (!active) return;
    active.textContent = result.ok ? "已切換" : "切換失敗";
    active.classList.toggle("has-error", !result.ok);
    window.setTimeout(() => {
      if (!active.isConnected) return;
      active.textContent = active.dataset.label;
      active.classList.remove("has-error");
    }, 1400);
  }

  function renderQuickFilters() {
    if (document.querySelector("#nkust-radar-quick-filters")) return;
    const anchor = document.querySelector("#ewantCourseSearch")
      || document.querySelector("#AICourseSearch")
      || document.querySelector("#courseSearchEnglish")
      || document.querySelector("#bntSearchCourse");
    if (!anchor?.parentElement) return;
    const container = document.createElement("span");
    container.id = "nkust-radar-quick-filters";
    container.setAttribute("role", "group");
    container.setAttribute("aria-label", "常用課程快速查詢");
    [
      { label: "博雅教育中心", unitId: "XB02" },
      { label: "體育課程", unitId: "XP00" },
    ].forEach(({ label, unitId }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nkust-radar-quick-filter";
      button.dataset.label = label;
      button.dataset.unitId = unitId;
      button.textContent = label;
      button.title = unitId === "XB02"
        ? `切換至${label}，年級設為 ALL 並查詢`
        : `切換至${label}並查詢（保留目前年級）`;
      button.addEventListener("click", () => {
        window.clearTimeout(quickFilterTimer);
        document.querySelectorAll(".nkust-radar-quick-filter").forEach((item) => {
          item.disabled = true;
          item.setAttribute("aria-busy", "true");
        });
        button.textContent = "切換中…";
        window.postMessage({ source: "nkust-radar-content", kind: "quick-filter", unitId }, "*");
        quickFilterTimer = window.setTimeout(() => {
          resetQuickFilterButtons("校方查詢元件沒有回應，請再試一次");
          button.textContent = "切換失敗";
          button.classList.add("has-error");
          window.setTimeout(() => {
            if (!button.isConnected) return;
            button.textContent = button.dataset.label;
            button.classList.remove("has-error");
          }, 1400);
        }, 5000);
      });
      container.appendChild(button);
    });
    anchor.insertAdjacentElement("afterend", container);
  }

  function queryViaPageHook(course) {
    const countId = course.countId;
    if (!countId) return Promise.resolve(null);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingCountQueries.delete(requestId);
        resolve(null);
      }, 6000);
      pendingCountQueries.set(requestId, { resolve, timer });
      window.postMessage({
        source: "nkust-radar-content",
        kind: "count-query",
        requestId,
        countId,
        endpoint: course.countEndpoint,
      }, "*");
    });
  }

  async function queryDirectFromPage(course) {
    const schoolYear = document.querySelector("#SchoolYear")?.value;
    const semester = document.querySelector("#Semester")?.value;
    const countId = course.countId || course.id;
    if (!countId) return null;
    try {
      const body = new URLSearchParams({
        selCrsno: countId,
        selSchoolYear: schoolYear,
        selSemester: semester,
      });
      const response = await fetch(new URL(course.countEndpoint || COUNT_ENDPOINT, location.href), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: body.toString(),
      });
      if (!response.ok) return null;
      return parseCounts(await response.text());
    } catch {
      return null;
    }
  }

  function resultKey(course) {
    return pinnedKey(course);
  }

  function renderPinnedSummary() {
    const grid = document.querySelector(COURSE_GRID);
    if (!grid?.parentElement) return;
    let panel = document.querySelector("#nkust-radar-pinned-summary");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "nkust-radar-pinned-summary";
      panel.setAttribute("aria-label", "本學期釘選課程");
      grid.parentElement.insertBefore(panel, grid);
    }
    const pins = Array.isArray(pinnedBySemester[currentSemester]) ? pinnedBySemester[currentSemester] : [];
    panel.replaceChildren();
    panel.hidden = pins.length === 0;
    if (!pins.length) return;
    const heading = document.createElement("div");
    heading.className = "nkust-radar-pinned-heading";
    const title = document.createElement("strong");
    title.textContent = `本學期釘選 ${pins.length} 門課程`;
    const hint = document.createElement("span");
    hint.textContent = "點擊課程可回到目前清單";
    heading.append(title, hint);
    panel.appendChild(heading);
    const list = document.createElement("div");
    list.className = "nkust-radar-pinned-list";
    pins.forEach((course) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nkust-radar-pinned-course";
      const meta = document.createElement("span");
      meta.className = "nkust-radar-pinned-meta";
      const code = document.createElement("span");
      code.className = "nkust-radar-pinned-code";
      code.textContent = course.crsno || "未命名課程";
      const name = document.createElement("span");
      name.className = "nkust-radar-pinned-name";
      name.textContent = course.subjectName || "";
      meta.append(code, name);
      button.appendChild(meta);
      const status = statusElement(latestResults.get(pinnedKey(course)));
      button.appendChild(status);
      button.addEventListener("click", () => {
        const row = getRows().find((item) => {
          const current = getCourseFromRow(item);
          return current && pinnedKey(current) === pinnedKey(course);
        });
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        row?.querySelector(".nkust-radar-pin")?.focus();
      });
      list.appendChild(button);
    });
    panel.appendChild(list);
  }

  async function requestCounts(course) {
    const key = resultKey(course);
    if (inFlight.has(key)) return inFlight.get(key);
    const task = (async () => {
      let counts = await queryViaPageHook(course);
      if (!counts) counts = await queryDirectFromPage(course);
      const value = counts ? { ...counts, updatedAt: Date.now(), state: "known" } : { updatedAt: Date.now(), state: "unknown" };
      latestResults.set(key, value);
      return value;
    })();
    inFlight.set(key, task);
    try {
      return await task;
    } finally {
      inFlight.delete(key);
    }
  }

  async function refreshPinnedCounts(visibleCourses = []) {
    if (pinnedRefreshing) return;
    const pins = Array.isArray(pinnedBySemester[currentSemester]) ? pinnedBySemester[currentSemester] : [];
    if (!pins.length) return;
    const visibleKeys = new Set(visibleCourses.map((course) => pinnedKey(course)));
    pinnedRefreshing = true;
    try {
      for (const pin of pins) {
        if (visibleKeys.has(pinnedKey(pin))) continue;
        await requestCounts(pin);
        renderPinnedSummary();
      }
    } finally {
      pinnedRefreshing = false;
    }
  }

  function statusElement(value) {
    const element = document.createElement("span");
    element.className = "nkust-radar-status";
    if (!value || value.state === "unknown") {
      element.classList.add("unknown");
      element.textContent = "名額未知";
    } else if (value.selected < value.limit) {
      element.classList.add("available");
      element.textContent = `可選 ${value.selected}/${value.limit}`;
    } else {
      element.classList.add("full");
      element.textContent = `已滿 ${value.selected}/${value.limit}`;
    }
    return element;
  }

  function decorateRows() {
    getRows().forEach((row) => {
      const course = getCourseFromRow(row);
      if (!course) return;
      const cell = rowColumns(row).name;
      if (!cell) return;
      let pin = cell.querySelector(".nkust-radar-pin");
      if (!pin) {
        pin = document.createElement("button");
        pin.type = "button";
        pin.className = "nkust-radar-pin";
        pin.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void togglePin(course);
        });
        cell.appendChild(pin);
      }
      const pinned = isPinned(course);
      row.classList.toggle("nkust-radar-row-pinned", pinned);
      pin.classList.toggle("is-pinned", pinned);
      pin.textContent = pinned ? "我的課" : "釘選";
      pin.setAttribute("aria-label", pinned ? `取消釘選 ${course.crsno}` : `釘選 ${course.crsno}`);
      let badge = cell.querySelector(".nkust-radar-status");
      if (!badge) {
        badge = statusElement(latestResults.get(pinnedKey(course)));
        cell.appendChild(badge);
      } else {
        const next = statusElement(latestResults.get(pinnedKey(course)));
        badge.className = next.className;
        badge.textContent = next.textContent;
      }
    });
    renderPinnedSummary();
  }

  async function updateCurrentSemester() {
    if (updating) {
      pendingUpdate = true;
      return;
    }
    const rows = getRows();
    updating = true;
    const generation = ++updateGeneration;
    const queriedThisRun = new Set();
    try {
      let pinMetadataChanged = false;
      const semesterPins = Array.isArray(pinnedBySemester[currentSemester]) ? pinnedBySemester[currentSemester] : [];
      rows.forEach((row) => {
        const course = getCourseFromRow(row);
        if (!course) return;
        latestResults.set(resultKey(course), { state: "unknown", updatedAt: Date.now() });
        const pinned = semesterPins.find((item) => item.id === course.id);
        if (pinned && pinned.countId !== course.countId) {
          Object.assign(pinned, course);
          pinMetadataChanged = true;
        }
      });
      if (pinMetadataChanged) await persistPins();
      decorateRows();
      for (const row of rows) {
        if (generation !== updateGeneration) return;
        const course = getCourseFromRow(row);
        if (!course) continue;
        if (queriedThisRun.has(resultKey(course))) continue;
        await requestCounts(course);
        queriedThisRun.add(resultKey(course));
        decorateRows();
      }
      await refreshPinnedCounts(rows.map((row) => getCourseFromRow(row)).filter(Boolean));
      decorateRows();
    } finally {
      updating = false;
      if (pendingUpdate) {
        pendingUpdate = false;
        scheduleUpdate(true);
      }
    }
  }

  function scheduleUpdate(force = false) {
    window.clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => {
      const signature = getRows().map((row) => getCourseFromRow(row)?.id || "").join("|");
      if (!force && signature === gridSignature) {
        decorateRows();
        return;
      }
      gridSignature = signature;
      void updateCurrentSemester();
    }, 180);
  }

  async function initialise() {
    currentSemester = detectSemester();
    const stored = await safeStorageGet([STORAGE_KEY, FILTER_KEY]);
    pinnedBySemester = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
    timeFiltersBySemester = stored[FILTER_KEY] && typeof stored[FILTER_KEY] === "object" ? stored[FILTER_KEY] : {};
    if (currentSemester !== "未知學期" && Array.isArray(pinnedBySemester["未知學期"])) {
      const merged = [...(pinnedBySemester[currentSemester] || [])];
      pinnedBySemester["未知學期"].forEach((course) => {
        if (!merged.some((item) => item.id === course.id)) merged.push({ ...course, semester: currentSemester });
      });
      pinnedBySemester[currentSemester] = merged;
      delete pinnedBySemester["未知學期"];
      await persistPins();
    }
    if (currentSemester !== "未知學期" && Object.prototype.hasOwnProperty.call(timeFiltersBySemester, "未知學期")) {
      if (!Object.prototype.hasOwnProperty.call(timeFiltersBySemester, currentSemester)) {
        timeFiltersBySemester[currentSemester] = timeFiltersBySemester["未知學期"];
      }
      delete timeFiltersBySemester["未知學期"];
      await safeStorageSet({ [FILTER_KEY]: timeFiltersBySemester });
    }
    renderTimeFilterControls();
    renderQuickFilters();
    renderPinnedSummary();
    scheduleUpdate(true);

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.source !== "nkust-radar-page-hook") return;
      if (event.data.kind === "count-query-result") {
        const pending = pendingCountQueries.get(String(event.data.requestId || ""));
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingCountQueries.delete(String(event.data.requestId));
        pending.resolve(event.data.ok ? parseCounts(event.data.responseBody) : null);
      } else if (event.data.kind === "quick-filter-result") {
        handleQuickFilterResult(event.data);
      }
    });

    const grid = document.querySelector(COURSE_GRID);
    if (grid || document.body) {
      const observer = new MutationObserver((records) => {
        const changedRows = records.some((record) => {
          const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
          if (target?.matches?.(`${COURSE_GRID} tbody`)) return true;
          return [...record.addedNodes, ...record.removedNodes].some((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            const element = node;
            return element.matches?.("tr") || Boolean(element.querySelector?.("tbody tr"));
          });
        });
        if (changedRows) scheduleUpdate(false);
      });
      observer.observe(grid || document.body, { childList: true, subtree: true });
    }
    const timeObserver = new MutationObserver((records) => {
      const opened = records.some((record) => [...record.addedNodes].some((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return false;
        const element = node;
        return element.id === "select_time" || element.matches?.('input[name="CheckTime"]') || Boolean(element.querySelector?.('#select_time,input[name="CheckTime"]'));
      }));
      if (opened) renderTimeFilterControls();
    });
    if (document.body) timeObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", (event) => {
      const input = event.target.closest?.('input[name="CheckTime"]');
      if (input) scheduleSaveTimeFilters();
    }, true);
    document.addEventListener("click", (event) => {
      const target = event.target.closest?.("#bntSearchCourse,#courseSearchEnglish,#AICourseSearch,#ewantCourseSearch,#courseGrid .k-pager-nav,#courseGrid .k-grid-refresh,[title*='刷新']");
      const clickedRefresh = event.target.closest?.("button") && /刷新/.test(text(event.target.closest("button").textContent));
      const timeAction = event.target.closest?.("#btnSelectAll,#btnClearAll");
      if (target || clickedRefresh) scheduleUpdate(true);
      if (timeAction) window.setTimeout(scheduleSaveTimeFilters, 80);
      renderQuickFilters();
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void initialise(), { once: true });
  else void initialise();
})();
