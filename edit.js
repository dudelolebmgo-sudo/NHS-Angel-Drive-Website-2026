(function () {
  const $ = id => document.getElementById(id);
  if (!$("grade-body")) {
    // An older cached copy of edit.html is paired with this newer script.
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      '<div class="status show err" style="margin-top:24px">This page is still updating. Wait a few minutes, then reload. Don\'t publish until the Classes section shows a Sections dropdown for each grade.</div>');
    document.querySelectorAll("button").forEach(b => (b.disabled = true));
    return;
  }
  const LS = { repo: "angel.repo", branch: "angel.branch", token: "angel.token" };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let data = null;      // working copy
  let sha = null;       // sha of data.json on GitHub, needed to update it
  let current = -1;     // index into data.meetings, or -1 for a new meeting
  let draft = null;     // the new meeting being entered
  let dirty = false;

  // ---------- Setup ----------
  $("repo").value = store.get(LS.repo) || guessRepo();
  $("branch").value = store.get(LS.branch) || "main";
  $("token").value = store.get(LS.token) || "";

  function guessRepo() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const owner = h.replace(".github.io", "");
      const repo = location.pathname.split("/").filter(Boolean)[0];
      return repo && !repo.endsWith(".html") ? `${owner}/${repo}` : `${owner}/${h}`;
    }
    return "dudelolebmgo-sudo/NHS-Angel-Drive-Website-2026";
  }

  // Meetings are on Thursdays: default a new meeting to today if it's Thursday,
  // otherwise the most recent Thursday.
  const MEETING_WEEKDAY = 4; // 0 = Sunday … 4 = Thursday
  function todayISO() {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() - MEETING_WEEKDAY + 7) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function status(el, kind, msg) {
    const s = $(el);
    s.className = "status show " + kind;
    s.textContent = msg;
  }

  function markDirty(v = true) {
    dirty = v;
    $("dirty").textContent = v ? "You have changes that aren't published yet." : "";
  }

  window.addEventListener("beforeunload", e => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  function saveConn() {
    if ($("remember").checked) {
      store.set(LS.repo, $("repo").value.trim());
      store.set(LS.branch, $("branch").value.trim());
      if ($("token").value.trim()) store.set(LS.token, $("token").value.trim());
    }
  }

  // ---------- GitHub API ----------
  function api(path, opts = {}) {
    const token = $("token").value.trim();
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch("https://api.github.com/repos/" + $("repo").value.trim() + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  }

  const b64encode = str => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));

  async function load() {
    if (dirty && !confirm("Loading will discard your unpublished changes. Continue?")) return;
    saveConn();
    const token = $("token").value.trim();
    try {
      if (token) {
        const res = await api("/contents/data.json?ref=" + encodeURIComponent($("branch").value.trim()));
        if (res.status === 401) throw new Error("GitHub rejected the token. Check that it's pasted correctly and hasn't expired.");
        if (res.status === 404) throw new Error("Couldn't find data.json in that repository and branch. Check the repository name, the branch, and that the token has access to this repository.");
        if (!res.ok) throw new Error("GitHub returned an error (" + res.status + ").");
        const j = await res.json();
        sha = j.sha;
        data = JSON.parse(b64decode(j.content));
        status("conn-status", "ok", "Connected. Loaded the latest data from GitHub.");
      } else {
        const res = await fetch("data.json?v=" + Date.now(), { cache: "no-store" });
        data = await res.json();
        sha = null;
        status("conn-status", "info", "Loaded the data shown on the site. Add a token to publish changes, or use Download data.json.");
      }
    } catch (e) {
      status("conn-status", "err", e.message || "Couldn't load the data.");
      if (!data) { data = { driveName: "Christmas Angel Drive", year: new Date().getFullYear(), goal: 0, classes: [], meetings: [] }; }
    }
    data.classes = data.classes || [];
    data.meetings = Drive.sortedMeetings(data);
    const fixed = renumberSections();
    newDraft();
    current = -1;
    renderAll();
    markDirty(fixed);
    if (fixed) status("pub-status", "info", "Some section numbers were tidied up (for example Nursery-. is now Nursery-1). Publish to save the fix.");
  }

  // Sections are always numbered 1, 2, 3… within each grade.
  function renumberSections() {
    let changed = false;
    const grades = [...new Set(data.classes.map(c => String(c.grade)))];
    grades.forEach(g => {
      data.classes.filter(c => String(c.grade) === g).sort(Drive.compareClasses).forEach((c, i) => {
        if (String(c.section) !== String(i + 1)) { c.section = String(i + 1); changed = true; }
      });
    });
    return changed;
  }

  function newDraft() {
    draft = { date: todayISO(), added: {} };
  }

  // ---------- Meeting entry ----------
  function activeMeeting() {
    return current === -1 ? draft : data.meetings[current];
  }

  function beforeTotals() {
    const m = activeMeeting();
    const t = {};
    data.classes.forEach(c => (t[c.id] = 0));
    data.meetings.forEach((x, i) => {
      if (i === current) return;
      if (x.date <= m.date) for (const [id, n] of Object.entries(x.added || {})) if (id in t) t[id] += Number(n) || 0;
    });
    return t;
  }

  function renderMeetingPick() {
    const opts = ['<option value="-1">New meeting</option>'].concat(
      data.meetings.map((m, i) => `<option value="${i}">${Drive.fmtDate(m.date, { month: "long", day: "numeric", year: "numeric" })}</option>`).reverse()
    );
    $("meeting-pick").innerHTML = opts.join("");
    $("meeting-pick").value = String(current);
    $("meeting-date").value = activeMeeting().date;
    $("delete-meeting").hidden = current === -1;
  }

  function renderEntry() {
    const m = activeMeeting();
    const before = beforeTotals();
    const classes = [...data.classes].sort(Drive.compareClasses);
    if (!classes.length) {
      $("entry-body").innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No classes yet. Add them in step 3.</td></tr>';
    } else {
      $("entry-body").innerHTML = classes.map(c => {
        const v = m.added[c.id];
        return `<tr data-id="${c.id}">
          <td>${esc(Drive.classLabel(c))}</td>
          <td class="num before">${Drive.fmt(before[c.id] || 0)}</td>
          <td class="num in"><input type="number" min="0" step="1" inputmode="numeric" aria-label="Items from ${esc(Drive.classLabel(c))}" value="${v ? v : ""}"></td>
          <td class="num after">${Drive.fmt((before[c.id] || 0) + (Number(v) || 0))}</td>
        </tr>`;
      }).join("");
    }
    updateSums();
  }

  function updateSums() {
    const m = activeMeeting();
    const before = beforeTotals();
    const b = Drive.sum(before);
    const a = data.classes.reduce((s, c) => s + (Number(m.added[c.id]) || 0), 0);
    $("sum-before").textContent = Drive.fmt(b);
    $("sum-add").textContent = "+" + Drive.fmt(a);
    $("sum-after").textContent = Drive.fmt(b + a);
  }

  $("entry-body").addEventListener("input", e => {
    const input = e.target.closest("input");
    if (!input) return;
    const tr = input.closest("tr");
    const id = tr.dataset.id;
    const m = activeMeeting();
    const n = Math.max(0, Math.floor(Number(input.value) || 0));
    if (n) m.added[id] = n; else delete m.added[id];
    tr.querySelector(".after").textContent = Drive.fmt((beforeTotals()[id] || 0) + n);
    updateSums();
    markDirty();
  });

  // Enter moves to the next class, which is quick during a meeting.
  $("entry-body").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const inputs = [...$("entry-body").querySelectorAll("input")];
    const i = inputs.indexOf(e.target);
    if (i > -1 && inputs[i + 1]) { e.preventDefault(); inputs[i + 1].focus(); inputs[i + 1].select(); }
  });

  $("meeting-pick").addEventListener("change", e => {
    current = Number(e.target.value);
    renderMeetingPick();
    renderEntry();
  });

  $("meeting-date").addEventListener("change", e => {
    const v = e.target.value;
    if (!v) return;
    const clash = data.meetings.findIndex((m, i) => m.date === v && i !== current);
    if (clash > -1) {
      alert("There's already a meeting on that date. Choose it from the Meeting list to edit it.");
      e.target.value = activeMeeting().date;
      return;
    }
    activeMeeting().date = v;
    if (current > -1) {
      const m = data.meetings[current];
      data.meetings = Drive.sortedMeetings(data);
      current = data.meetings.indexOf(m);
      renderMeetingPick();
    }
    renderEntry();
    markDirty();
  });

  $("delete-meeting").addEventListener("click", () => {
    if (current === -1) return;
    const m = data.meetings[current];
    if (!confirm(`Delete the ${Drive.fmtDate(m.date, { month: "long", day: "numeric" })} meeting and all its counts?`)) return;
    data.meetings.splice(current, 1);
    current = -1;
    renderMeetingPick();
    renderEntry();
    markDirty();
  });

  // ---------- Classes ----------
  // Every grade at the school, in order. Each gets a "Sections" dropdown.
  const SCHOOL_GRADES = ["Nursery", "Junior Kinder", "Kinder", "1", "2", "3", "4", "5"];
  const SECTION_CHOICES = [[0, "Not in the drive"], [1, "1 section"], [2, "2 sections"], [3, "3 sections"]];

  function gradeList() {
    const extra = data.classes.map(c => String(c.grade)).filter(g => !SCHOOL_GRADES.includes(g));
    return [...SCHOOL_GRADES, ...new Set(extra)];
  }

  function classesIn(g) {
    return data.classes.filter(c => String(c.grade) === g).sort(Drive.compareClasses);
  }

  function idFor(g, s) {
    const short = { "Nursery": "n", "Junior Kinder": "jk", "Kinder": "k" }[g] || ("g" + g).toLowerCase().replace(/[^a-z0-9]+/g, "");
    let id = `${short}-${s}`, n = 2;
    while (data.classes.some(c => c.id === id)) id = `${short}-${s}-${n++}`;
    return id;
  }

  function classTotal(id) {
    return data.meetings.reduce((t, m) => t + (Number(m.added[id]) || 0), 0) + (Number(draft.added[id]) || 0);
  }

  function renderClasses() {
    $("grade-body").innerHTML = gradeList().map(g => {
      const cs = classesIn(g);
      const n = cs.length;
      const choices = SECTION_CHOICES.some(([v]) => v === n) ? SECTION_CHOICES : [...SECTION_CHOICES, [n, n + " sections"]];
      return `<tr data-grade="${esc(g)}">
        <td><strong>${esc(Drive.gradeName(g))}</strong></td>
        <td><select aria-label="Sections in ${esc(Drive.gradeName(g))}">${choices.map(([v, l]) => `<option value="${v}"${v === n ? " selected" : ""}>${l}</option>`).join("")}</select></td>
        <td class="classes-out">${cs.length ? cs.map(c => esc(Drive.classLabel(c))).join(", ") : "Hidden"}</td>
      </tr>`;
    }).join("");
  }

  $("grade-body").addEventListener("change", e => {
    const sel = e.target.closest("select");
    if (!sel) return;
    const g = sel.closest("tr").dataset.grade;
    const want = Number(sel.value);
    const cs = classesIn(g);

    if (want < cs.length) {
      const removing = cs.slice(want);
      const withCounts = removing.filter(c => classTotal(c.id) > 0);
      if (withCounts.length) {
        const list = withCounts.map(c => `${Drive.classLabel(c)} (${Drive.fmt(classTotal(c.id))} items)`).join(", ");
        if (!confirm(`This removes ${list} and deletes those counts. Continue?`)) { sel.value = String(cs.length); return; }
      }
      const ids = new Set(removing.map(c => c.id));
      data.classes = data.classes.filter(c => !ids.has(c.id));
      data.meetings.forEach(m => ids.forEach(id => delete m.added[id]));
      ids.forEach(id => delete draft.added[id]);
    } else {
      const used = new Set(cs.map(c => String(c.section)));
      let s = 1;
      for (let k = cs.length; k < want; k++) {
        while (used.has(String(s))) s++;
        used.add(String(s));
        data.classes.push({ id: idFor(g, String(s)), grade: g, section: String(s) });
      }
    }
    renderClasses();
    renderEntry();
    markDirty();
  });

  // ---------- Settings ----------
  function renderSettings() {
    $("s-name").value = data.driveName || "";
    $("s-org").value = data.organization || "";
    $("s-year").value = data.year || "";
    $("s-goal").value = data.goal || "";
    $("s-end").value = data.endDate || "";
    $("s-sample").checked = !!data.sample;
  }

  const settingMap = { "s-name": "driveName", "s-org": "organization", "s-year": "year", "s-goal": "goal", "s-end": "endDate", "s-sample": "sample" };
  Object.entries(settingMap).forEach(([el, key]) => {
    $(el).addEventListener("change", e => {
      const t = e.target;
      if (t.type === "checkbox") data[key] = t.checked;
      else if (t.type === "number") data[key] = t.value === "" ? 0 : Number(t.value);
      else data[key] = t.value.trim() || null;
      markDirty();
    });
  });

  $("clear-all").addEventListener("click", () => {
    if (!confirm("Delete every meeting's counts and start from zero? Classes and settings stay. This is only saved when you publish.")) return;
    data.meetings = [];
    data.sample = false;
    current = -1;
    newDraft();
    renderAll();
    markDirty();
  });

  // ---------- Output ----------
  function buildOutput() {
    const out = JSON.parse(JSON.stringify(data));
    if (Object.keys(draft.added).length) out.meetings.push(JSON.parse(JSON.stringify(draft)));
    out.meetings = Drive.sortedMeetings(out);
    out.classes = [...out.classes].sort(Drive.compareClasses);
    return out;
  }

  $("download").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(buildOutput(), null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "data.json";
    a.click();
    URL.revokeObjectURL(a.href);
    status("pub-status", "info", "Downloaded data.json. Upload it to the repository on GitHub to replace the old one.");
  });

  $("publish").addEventListener("click", async () => {
    const token = $("token").value.trim();
    if (!token) { status("pub-status", "err", "Add an access token in step 1 to publish, or use Download data.json."); return; }
    if (current === -1 && draft.date && data.meetings.some(m => m.date === draft.date)) {
      status("pub-status", "err", "There's already a meeting on " + Drive.fmtDate(draft.date) + ". Choose it from the Meeting list to edit it instead.");
      return;
    }
    saveConn();
    const out = buildOutput();
    $("publish").disabled = true;
    status("pub-status", "info", "Publishing…");
    try {
      if (!sha) {
        const r = await api("/contents/data.json?ref=" + encodeURIComponent($("branch").value.trim()));
        if (r.ok) sha = (await r.json()).sha;
      }
      const label = current === -1 && Object.keys(draft.added).length ? "Add " + draft.date + " meeting" : "Update drive data";
      const res = await api("/contents/data.json", {
        method: "PUT",
        body: JSON.stringify({ message: label, content: b64encode(JSON.stringify(out, null, 2) + "\n"), sha: sha || undefined, branch: $("branch").value.trim() })
      });
      if (res.status === 409 || res.status === 422) throw new Error("Someone else published since you loaded. Copy your numbers, choose Load latest data, and enter them again.");
      if (res.status === 401) throw new Error("GitHub rejected the token. Check that it's pasted correctly and hasn't expired.");
      if (res.status === 403 || res.status === 404) throw new Error("This token can't write to the repository. Make sure Contents is set to Read and write for this repository.");
      if (!res.ok) throw new Error("GitHub returned an error (" + res.status + ").");
      sha = (await res.json()).content.sha;
      const wasNew = current === -1 && Object.keys(draft.added).length;
      data = out;
      if (wasNew) current = data.meetings.findIndex(m => m.date === draft.date);
      newDraft();
      renderAll();
      markDirty(false);
      status("pub-status", "ok", "Published. The public page will show the new numbers in a minute or two.");
    } catch (e) {
      status("pub-status", "err", e.message || "Publishing failed.");
    } finally {
      $("publish").disabled = false;
    }
  });

  // ---------- Init ----------
  $("load-btn").addEventListener("click", load);
  $("forget-btn").addEventListener("click", () => {
    store.del(LS.token);
    $("token").value = "";
    status("conn-status", "info", "Token removed from this device.");
  });

  function renderAll() {
    renderMeetingPick();
    renderEntry();
    renderClasses();
    renderSettings();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  load();
})();
