(async function () {
  const $ = id => document.getElementById(id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SECTION_COLORS = ["#103327", "#a6243b", "#c9a676", "#3f7a5f", "#d8b24a", "#6b4a2b", "#c63a52", "#24584a"];

  let data;
  try {
    const res = await fetch("data.json?v=" + Date.now(), { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    $("tags").innerHTML = '<li class="empty">The standings could not be loaded. Refresh the page to try again.</li>';
    return;
  }

  const classes = [...(data.classes || [])].sort(Drive.compareClasses);
  const meetings = Drive.sortedMeetings(data);
  const totals = Drive.totals(data);
  const grand = Drive.sum(totals);
  const lastMeeting = meetings[meetings.length - 1];
  const lastAdded = lastMeeting ? Drive.sum(Object.fromEntries(Object.entries(lastMeeting.added || {}).map(([k, v]) => [k, Number(v) || 0]))) : 0;

  // ---------- Header ----------
  const title = `${data.driveName || "Christmas Angel Drive"} ${data.year || ""}`.trim();
  $("title").textContent = title;
  document.title = title;
  if (data.organization) $("org").textContent = data.organization;
  $("sample-banner").hidden = !data.sample;

  $("fact-classes").textContent = classes.length;
  $("fact-last").textContent = lastMeeting ? "+" + Drive.fmt(lastAdded) : "–";

  if (data.endDate) {
    const [y, m, d] = data.endDate.split("-").map(Number);
    const end = new Date(y, m - 1, d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((end - today) / 86400000);
    if (days > 0) {
      $("fact-days").textContent = days;
      $("fact-days-label").textContent = days === 1 ? "day left" : "days left";
    } else {
      $("fact-days").textContent = Drive.fmtDate(data.endDate);
      $("fact-days-label").textContent = days === 0 ? "last day" : "drive ended";
    }
  } else {
    $("fact-days-wrap").hidden = true;
  }

  // Count-up + ribbon: the page's one entrance moment.
  const goal = Number(data.goal) || 0;
  const pct = goal ? Math.min(100, (grand / goal) * 100) : 0;
  const track = $("ribbon-track");
  if (goal) {
    track.setAttribute("aria-valuemax", goal);
    track.setAttribute("aria-valuenow", grand);
    $("goal-pct").textContent = `${Math.round((grand / goal) * 100)}% of our goal`;
    $("goal-text").textContent = grand >= goal ? `Goal of ${Drive.fmt(goal)} reached` : `${Drive.fmt(goal - grand)} to go of ${Drive.fmt(goal)}`;
  } else {
    $("ribbon").hidden = true;
  }

  const setRibbon = p => {
    $("ribbon-fill").style.width = p + "%";
    $("bow").style.left = `clamp(29px, ${p}%, calc(100% - 29px))`;
  };

  if (reduceMotion) {
    $("total").textContent = Drive.fmt(grand);
    setRibbon(pct);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => setRibbon(pct)));
    const start = performance.now(), dur = 1400;
    const tick = now => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      $("total").textContent = Drive.fmt(Math.round(grand * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---------- Standings ----------
  const prevTotals = meetings.length > 1 ? Drive.totals(data, meetings.length - 2) : null;
  const ranked = classes.map(c => ({ ...c, total: totals[c.id] || 0, last: Number((lastMeeting?.added || {})[c.id]) || 0 }))
    .sort((a, b) => b.total - a.total || Drive.compareClasses(a, b));
  let rank = 0, prev = null;
  ranked.forEach((c, i) => { if (c.total !== prev) { rank = i + 1; prev = c.total; } c.rank = rank; });

  let prevRank = {};
  if (prevTotals) {
    const pr = classes.map(c => ({ id: c.id, t: prevTotals[c.id] || 0 })).sort((a, b) => b.t - a.t);
    let r = 0, p = null;
    pr.forEach((c, i) => { if (c.t !== p) { r = i + 1; p = c.t; } prevRank[c.id] = r; });
  }

  const leader = ranked.length ? ranked[0].total : 0;
  const grades = [...new Set(classes.map(c => String(c.grade)))];

  const star = cls => `<svg class="tag-star ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.8 6.3 6.9.6-5.2 4.6 1.6 6.7L12 17.2l-6.1 3.5 1.6-6.7-5.2-4.6 6.9-.6z"/></svg>`;

  function renderTags(filter) {
    const list = filter === "all" ? ranked : ranked.filter(c => String(c.grade) === filter);
    if (!list.length) {
      $("tags").innerHTML = '<li class="empty">No classes yet. Add classes in the editor.</li>';
      return;
    }
    $("tags").innerHTML = list.map(c => {
      const w = leader ? Math.max(2, (c.total / leader) * 100) : 0;
      const isTop = c.rank <= 3 && c.total > 0;
      let move = "";
      if (prevRank[c.id] && prevRank[c.id] !== c.rank) {
        const diff = prevRank[c.id] - c.rank;
        move = diff > 0 ? `<span class="mv up" title="Up ${diff} since last meeting">▲ ${diff}</span>` : `<span class="mv down" title="Down ${-diff} since last meeting">▼ ${-diff}</span>`;
      }
      return `<li class="tag${isTop ? " top" : ""}">
        <div class="tag-body">
          ${c.total > 0 ? `<span class="tag-rank">#${c.rank}</span>` : ""}
          ${isTop ? star(c.rank === 1 ? "gold" : "") : ""}
          <p class="tag-name"><strong>${esc(Drive.classLabel(c))}</strong></p>
          <div class="tag-count">${Drive.fmt(c.total)}</div>
          <span class="tag-unit">${c.total === 1 ? "item" : "items"}</span>
          <div class="tag-bar" aria-hidden="true"><i style="width:${w}%"></i></div>
          <div class="tag-delta">
            <span>${lastMeeting ? `<span class="up">+${Drive.fmt(c.last)}</span> last time` : ""}</span>
            <span>${move}</span>
          </div>
        </div>
      </li>`;
    }).join("");
  }

  const filterEl = $("grade-filter");
  const filters = [["all", "All grades"], ...grades.map(g => [g, Drive.gradeName(g)])];
  filterEl.innerHTML = filters.map(([v, l], i) => `<button class="chip" type="button" data-v="${esc(v)}" aria-pressed="${i === 0}">${esc(l)}</button>`).join("");
  filterEl.addEventListener("click", e => {
    const b = e.target.closest(".chip");
    if (!b) return;
    filterEl.querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderTags(b.dataset.v);
  });
  if (grades.length < 2) filterEl.hidden = true;
  renderTags("all");

  // ---------- By grade ----------
  const gradeData = grades.map(g => {
    const cs = classes.filter(c => String(c.grade) === g);
    return { g, cs, total: cs.reduce((a, c) => a + (totals[c.id] || 0), 0) };
  });
  const maxGrade = Math.max(1, ...gradeData.map(d => d.total));
  $("grades").innerHTML = gradeData.map(d => {
    const segs = d.cs.map((c, i) => {
      const t = totals[c.id] || 0;
      return `<span title="${esc(Drive.classLabel(c))}: ${Drive.fmt(t)}" style="width:${(t / maxGrade) * 100}%;background:${SECTION_COLORS[i % SECTION_COLORS.length]}"></span>`;
    }).join("");
    return `<li class="grade-row"><span class="g-name">${esc(Drive.gradeName(d.g))}</span><div class="grade-track" role="img" aria-label="${esc(Drive.gradeName(d.g))}: ${d.cs.map(c => `${esc(Drive.classLabel(c))} ${totals[c.id] || 0}`).join(", ")}">${segs}</div><span class="g-total">${Drive.fmt(d.total)}</span></li>`;
  }).join("") || '<li class="empty">No grades yet.</li>';

  const maxSections = Math.max(0, ...gradeData.map(d => d.cs.length));
  if (maxSections > 1) {
    const legend = document.createElement("p");
    legend.className = "grade-legend";
    legend.innerHTML = Array.from({ length: maxSections }, (_, i) =>
      `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px"><i style="width:12px;height:12px;border-radius:2px;background:${SECTION_COLORS[i % SECTION_COLORS.length]};display:inline-block"></i>${ordinalSection(i, gradeData)}</span>`).join("");
    $("grades").after(legend);
  }

  function ordinalSection(i, gd) {
    const names = new Set(gd.map(d => d.cs[i] && d.cs[i].section).filter(Boolean));
    return names.size === 1 ? "Section " + [...names][0] : "Section slot " + (i + 1);
  }

  // ---------- Chart ----------
  renderChart();
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(renderChart, 150); });

  function renderChart() {
    if (!meetings.length) {
      $("chart").innerHTML = '<p class="empty">The chart fills in after the first meeting is published.</p>';
      return;
    }
    const W = Math.max(320, Math.round($("chart").clientWidth || 800)), H = W < 500 ? 220 : 260, pl = 44, pr = 12, pt = 22, pb = 34;
    let run = 0;
    const pts = meetings.map(m => {
      const add = Object.entries(m.added || {}).reduce((a, [id, n]) => a + (id in totals ? Number(n) || 0 : 0), 0);
      run += add;
      return { date: m.date, add, total: run };
    });
    const series = [{ date: null, total: 0 }, ...pts];
    const maxY = Math.max(goal || 0, run) * 1.08 || 10;
    const x = i => pl + (i / (series.length - 1)) * (W - pl - pr);
    const y = v => pt + (1 - v / maxY) * (H - pt - pb);
    const step = niceStep(maxY / 4);
    let grid = "";
    for (let v = 0; v <= maxY; v += step) {
      grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="#e3e9e5"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${Drive.fmt(v)}</text>`;
    }
    const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
    const area = `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
    const goalLine = goal ? `<line x1="${pl}" x2="${W - pr}" y1="${y(goal)}" y2="${y(goal)}" stroke="#a6243b" stroke-dasharray="5 5"/><text x="${W - pr}" y="${y(goal) - 6}" text-anchor="end" style="fill:#a6243b">Goal ${Drive.fmt(goal)}</text>` : "";
    const dots = series.map((p, i) => i === 0 ? "" :
      `<circle cx="${x(i)}" cy="${y(p.total)}" r="5" fill="#fff" stroke="#103327" stroke-width="2.5"><title>${Drive.fmtDate(p.date)}: ${Drive.fmt(p.total)} total (+${Drive.fmt(p.add)})</title></circle>
       <text x="${x(i)}" y="${H - 10}" text-anchor="middle">${Drive.fmtDate(p.date)}</text>`).join("");
    $("chart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Running total after each meeting">
      ${grid}${goalLine}
      <path d="${area}" fill="#103327" opacity=".08"/>
      <path d="${line}" fill="none" stroke="#103327" stroke-width="3" stroke-linejoin="round"/>
      <text x="${x(0)}" y="${H - 10}" text-anchor="middle">Start</text>
      ${dots}
    </svg>`;
    $("meeting-list").innerHTML = pts.slice().reverse().map(p => `<li>${Drive.fmtDate(p.date, { month: "long", day: "numeric" })}: <b>+${Drive.fmt(p.add)}</b></li>`).join("");
  }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  // ---------- Footer ----------
  if (lastMeeting) {
    $("updated").textContent = "Updated after the " + Drive.fmtDate(lastMeeting.date, { month: "long", day: "numeric", year: "numeric" }) + " meeting";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
})();
