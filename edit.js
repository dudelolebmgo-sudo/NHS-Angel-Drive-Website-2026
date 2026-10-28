(function () {
  const $ = id => document.getElementById(id);
  if (!$("lock") || !$("grade-body")) {
    // An older cached copy of edit.html is paired with this newer script.
    document.body.insertAdjacentHTML("afterbegin",
      '<div class="wrap"><div class="status show err" style="margin-top:24px">This page is still updating. Wait a few minutes, then reload.</div></div>');
    document.querySelectorAll("button").forEach(b => (b.disabled = true));
    return;
  }
  const LS = { repo: "angel.repo", branch: "angel.branch", vault: "angel.vault", oldToken: "angel.token" };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  let token = "";       // kept in memory only while unlocked
  let data = null;      // working copy
  let sha = null;       // sha of data.json on GitHub, needed to update it
  let current = -1;     // index into data.meetings, or -1 for a new meeting
  let draft = null;     // the new meeting being entered
  let dirty = false;

  // ---------- Repository ----------
  $("repo").value = store.get(LS.repo) || guessRepo();
  $("branch").value = store.get(LS.branch) || "main";
  const repo = () => (store.get(LS.repo) || $("repo").value).trim();
  const branch = () => (store.get(LS.branch) || $("branch").value || "main").trim();

  function guessRepo() {
    const h = location.hostname;
    if (h.endsWith(".github.io")) {
      const owner = h.replace(".github.io", "");
      const r = location.pathname.split("/").filter(Boolean)[0];
      return r && !r.endsWith(".html") ? `${owner}/${r}` : `${owner}/${h}`;
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
  function clearStatus(el) { $(el).className = "status"; $(el).textContent = ""; }

  function markDirty(v = true) {
    dirty = v;
    $("dirty").textContent = v ? "You have changes that aren't published yet." : "";
  }

  window.addEventListener("beforeunload", e => {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  // ---------- PIN vault ----------
  // The token is saved on this device encrypted with a key made from the PIN,
  // so the PIN is needed to use it. Nothing about the PIN is stored anywhere else.
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function keyFromPin(pin, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  async function lockToken(tok, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFromPin(pin, salt), enc.encode(tok));
    store.set(LS.vault, JSON.stringify({ salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) }));
  }

  async function unlockToken(pin) {
    const v = JSON.parse(store.get(LS.vault));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(v.iv) }, await keyFromPin(pin, fromB64(v.salt)), fromB64(v.ct));
    return dec.decode(pt);
  }

  // ---------- Lock screen ----------
  let fails = 0, waitUntil = 0;

  function showLock() {
    const hasVault = !!store.get(LS.vault);
    $("editor").hidden = true;
    $("lock-btn").hidden = true;
    $("lock").hidden = false;
    $("unlock-form").hidden = !hasVault;
    $("setup-form").hidden = hasVault;
    store.del(LS.oldToken); // the earlier editor saved the token unencrypted; remove that copy
    setTimeout(() => (hasVault ? $("pin") : $("token")).focus(), 0);
  }

  function showEditor() {
    $("lock").hidden = true;
    $("editor").hidden = false;
    $("lock-btn").hidden = false;
  }

  $("unlock-form").addEventListener("submit", async e => {
    e.preventDefault();
    const now = Date.now();
    if (now < waitUntil) { status("unlock-status", "err", `Too many tries. Wait ${Math.ceil((waitUntil - now) / 1000)} seconds.`); return; }
    const pin = $("pin").value.trim();
    if (!pin) return;
    status("unlock-status", "info", "Unlocking…");
    try {
      token = await unlockToken(pin);
    } catch (err) {
      fails++;
      $("pin").value = "";
      if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; status("unlock-status", "err", "Wrong PIN. Too many tries, so wait 30 seconds."); }
      else status("unlock-status", "err", "Wrong PIN. Try again.");
      return;
    }
    fails = 0;
    $("pin").value = "";
    clearStatus("unlock-status");
    showEditor();
    load();
  });

  $("forgot-pin").addEventListener("click", () => {
    if (!confirm("This removes the saved token from this device. You'll need to paste the GitHub token again and choose a new PIN. Continue?")) return;
    store.del(LS.vault);
    showLock();
  });

  $("setup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const tok = $("token").value.trim(), p1 = $("new-pin").value.trim(), p2 = $("new-pin2").value.trim();
    if (!tok) { status("setup-status", "err", "Paste the GitHub token first."); $("token").focus(); return; }
    if (!/^\d{4,8}$/.test(p1)) { status("setup-status", "err", "The PIN must be 4 to 8 digits."); $("new-pin").focus(); return; }
    if (p1 !== p2) { status("setup-status", "err", "The two PINs don't match."); $("new-pin2").value = ""; $("new-pin2").focus(); return; }
    store.set(LS.repo, $("repo").value.trim());
    store.set(LS.branch, $("branch").value.trim() || "main");
    status("setup-status", "info", "Checking the token with GitHub…");
    token = tok;
    try {
      const res = await api("/contents/data.json?ref=" + encodeURIComponent(branch()));
      if (res.status === 401) throw new Error("GitHub didn't accept that token. Check that it's pasted correctly and hasn't expired.");
      if (res.status === 403 || res.status === 404) throw new Error("That token can't reach this site's repository. Make sure it was created for " + repo() + ".");
      if (!res.ok) throw new Error("GitHub returned an error (" + res.status + "). Try again in a moment.");
    } catch (err) {
      token = "";
      status("setup-status", "err", err.message || "Couldn't reach GitHub. Check your connection.");
      return;
    }
    await lockToken(tok, p1);
    ["token", "new-pin", "new-pin2"].forEach(id => ($(id).value = ""));
    clearStatus("setup-status");
    showEditor();
    load();
  });

  $("lock-btn").addEventListener("click", () => {
    if (dirty && !confirm("Locking will discard your unpublished changes. Continue?")) return;
    token = "";
    data = null;
    markDirty(false);
    clearStatus("pub-status");
    showLock();
  });

  // ---------- GitHub API ----------
  function api(path, opts = {}) {
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: "Bearer " + token };
    return fetch("https://api.github.com/repos/" + repo() + path, { ...opts, cache: "no-store", headers: { ...headers, ...(opts.headers || {}) } });
  }

  const b64encode = str => {
    const bytes = enc.encode(str);
    let bin = "";
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin);
  };
  const b64decode = b64 => dec.decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));

  async function load() {
    clearStatus("conn-status");
    try {
      const res = await api("/contents/data.json?ref=" + encodeURIComponent(branch()));
      if (res.status === 401) throw new Error("GitHub no longer accepts the saved token. It may have expired. Lock the editor, choose Forgot PIN, and set it up with a new token.");
      if (!res.ok) throw new Error("Couldn't load the data from GitHub (error " + res.status + "). Reload the page to try again.");
      const j = await res.json();
      sha = j.sha;
      data = JSON.parse(b64decode(j.content));
    } catch (e) {
      status("conn-status", "err", e.message || "Couldn't load the data. Check your connection and reload.");
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
      $("entry-body").innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No classes yet. Set sections in step 2.</td></tr>';
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
    if (!token) { showLock(); return; }
    if (current === -1 && draft.date && data.meetings.some(m => m.date === draft.date)) {
      status("pub-status", "err", "There's already a meeting on " + Drive.fmtDate(draft.date) + ". Choose it from the Meeting list to edit it instead.");
      return;
    }
    const out = buildOutput();
    $("publish").disabled = true;
    status("pub-status", "info", "Publishing…");
    try {
      if (!sha) {
        const r = await api("/contents/data.json?ref=" + encodeURIComponent(branch()));
        if (r.ok) sha = (await r.json()).sha;
      }
      const label = current === -1 && Object.keys(draft.added).length ? "Add " + draft.date + " meeting" : "Update drive data";
      const res = await api("/contents/data.json", {
        method: "PUT",
        body: JSON.stringify({ message: label, content: b64encode(JSON.stringify(out, null, 2) + "\n"), sha: sha || undefined, branch: branch() })
      });
      if (res.status === 409 || res.status === 422) throw new Error("The data changed on GitHub since this page loaded (maybe from another device). Note your numbers, reload the page, and enter them again.");
      if (res.status === 401) throw new Error("GitHub no longer accepts the saved token. It may have expired. Lock the editor, choose Forgot PIN, and set it up with a new token.");
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
  function renderAll() {
    renderMeetingPick();
    renderEntry();
    renderClasses();
    renderSettings();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  showLock();
})();
