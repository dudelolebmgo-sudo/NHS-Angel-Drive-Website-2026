// Shared helpers for the public page and the editor.
const Drive = {
  // Early-years grades come before Grade 1, in this order.
  EARLY: ["nursery", "junior kinder", "kinder"],

  // Tidy what someone types: "kinder", "K" -> "Kinder"; "JK" -> "Junior Kinder"; "Grade 3" -> "3"
  normalizeGrade(g) {
    const s = String(g).trim().replace(/\s+/g, " ");
    const low = s.toLowerCase();
    const alias = {
      "nursery": "Nursery", "n": "Nursery",
      "junior kinder": "Junior Kinder", "junior kindergarten": "Junior Kinder", "jk": "Junior Kinder", "pre-k": "Junior Kinder", "prek": "Junior Kinder",
      "kinder": "Kinder", "kindergarten": "Kinder", "k": "Kinder", "kg": "Kinder"
    };
    if (alias[low]) return alias[low];
    const m = low.match(/^(?:grade\s*)?(\d+)(?:st|nd|rd|th)?(?:\s*grade)?$/);
    return m ? String(Number(m[1])) : s;
  },

  // "1" -> "Grade 1", "Kinder" -> "Kinder"
  gradeName(g) {
    return /^\d+$/.test(String(g).trim()) ? `Grade ${g}` : String(g);
  },

  // "Grade 1-1", "Junior Kinder-2"
  classLabel(c) {
    return `${Drive.gradeName(c.grade)}-${c.section}`;
  },

  gradeKey(g) {
    const s = String(g).trim().toLowerCase();
    const early = Drive.EARLY.indexOf(s);
    if (early > -1) return [0, early];
    const n = parseFloat(s);
    return isNaN(n) ? [2, s] : [1, n];
  },

  compareClasses(a, b) {
    const ga = Drive.gradeKey(a.grade), gb = Drive.gradeKey(b.grade);
    if (ga[0] !== gb[0]) return ga[0] - gb[0];
    if (ga[1] !== gb[1]) return ga[1] < gb[1] ? -1 : 1;
    const sa = Drive.gradeKey(a.section), sb = Drive.gradeKey(b.section);
    if (sa[0] !== sb[0]) return sa[0] - sb[0];
    return sa[1] < sb[1] ? -1 : sa[1] > sb[1] ? 1 : 0;
  },

  sortedMeetings(data) {
    return [...(data.meetings || [])].sort((a, b) => a.date.localeCompare(b.date));
  },

  // Totals per class id, optionally only counting meetings up to (and including) index `upto`.
  totals(data, upto) {
    const t = {};
    (data.classes || []).forEach(c => (t[c.id] = 0));
    const ms = Drive.sortedMeetings(data);
    const last = upto == null ? ms.length - 1 : upto;
    for (let i = 0; i <= last && i < ms.length; i++) {
      for (const [id, n] of Object.entries(ms[i].added || {})) {
        if (id in t) t[id] += Number(n) || 0;
      }
    }
    return t;
  },

  sum(obj) {
    return Object.values(obj).reduce((a, b) => a + b, 0);
  },

  fmtDate(iso, opts) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", opts || { month: "short", day: "numeric" });
  },

  fmt(n) {
    return Number(n).toLocaleString("en-US");
  },

  slug(grade, section) {
    return ("g" + grade + "s" + section).toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
};
