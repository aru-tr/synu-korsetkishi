'use strict';
(() => {
  const el = id => document.getElementById(id);
  const config = window.LAB_SUPABASE;
  let token = null;
  let page = 0;
  let filterTimer;
  let controller;
  const pageSize = 30;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const headers = () => ({ apikey: config.publishableKey, Authorization: `Bearer ${token}` });
  function logout(message = 'Аккаунттан шықтыңыз.') {
    controller?.abort();
    token = null;
    el('dashboard').hidden = true;
    el('loginSection').hidden = false;
    el('reportList').replaceChildren();
    el('teacherStatus').textContent = message;
  }
  function renderReport(report) {
    const details = node('details', undefined, 'report-item');
    const summary = node('summary');
    const time = new Intl.DateTimeFormat('kk-KZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Qyzylorda' }).format(new Date(report.created_at));
    summary.append(node('strong', report.student_name), node('span', report.student_class), node('time', time));
    const wrap = node('div', undefined, 'table-wrap');
    const table = node('table');
    const head = node('tr');
    for (const label of ['№', 'α', 'AO = OB, мм', 'AD, мм', 'CB, мм', 'n', 'εₙ, %', 'Δn']) head.append(node('th', label));
    const thead = node('thead'); thead.append(head); table.append(thead);
    const tbody = node('tbody');
    report.results.forEach((r, index) => {
      const tr = node('tr');
      const n = r.ad / r.cb, e = 1 / r.ad + 1 / r.cb;
      for (const value of [index + 1, `${r.angle}°`, r.radius, r.ad, r.cb, n.toFixed(3), (e * 100).toFixed(2), (n * e).toFixed(3)]) tr.append(node('td', String(value)));
      tbody.append(tr);
    });
    table.append(tbody); wrap.append(table);
    details.append(summary, wrap, node('h3', 'Оқушының қорытындысы'), node('p', report.conclusion, 'report-conclusion'));
    return details;
  }
  async function loadReports() {
    if (!token) return;
    controller?.abort();
    const current = new AbortController(); controller = current;
    el('teacherStatus').textContent = 'Жұмыстар жүктеліп жатыр…';
    el('nextPage').disabled = true; el('previousPage').disabled = true;
    const query = new URLSearchParams({ select: 'id,created_at,student_name,student_class,results,conclusion', order: 'created_at.desc,id.desc', limit: String(pageSize + 1), offset: String(page * pageSize) });
    const filter = el('classFilter').value.trim();
    // Exact filtering avoids treating punctuation and wildcard input as a query expression.
    if (filter) query.set('student_class', `eq.${filter}`);
    try {
      const response = await fetch(`${config.url}/rest/v1/refraction_reports?${query}`, { headers: headers(), signal: current.signal });
      if (response.status === 401) { logout('Кіру мерзімі аяқталды. Қайта кіріңіз.'); return; }
      if (!response.ok) throw new Error('load');
      const reports = await response.json();
      if (current.signal.aborted || !token) return;
      const displayed = reports.slice(0, pageSize);
      el('reportList').replaceChildren(...displayed.map(renderReport));
      el('reportCount').textContent = displayed.length ? `Оқушылардың жұмыстары · ${displayed.length}` : 'Жұмыстар әзірге жоқ';
      el('pageLabel').textContent = `${page + 1}-бет`;
      el('previousPage').disabled = page === 0;
      el('nextPage').disabled = reports.length <= pageSize;
      el('teacherStatus').textContent = displayed.length ? 'Жұмыстар жаңартылды. Уақыт: Қазақстан (UTC+5).' : 'Бұл сыныптан жауап табылмады.';
    } catch {
      if (current.signal.aborted) return;
      el('reportList').replaceChildren();
      el('teacherStatus').textContent = 'Жұмыстарды жүктеу мүмкін болмады. Байланысты тексеріп, «Жаңарту» батырмасын басыңыз.';
    }
  }
  el('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!config?.publishableKey) { el('teacherStatus').textContent = 'Supabase қосылымы әлі бапталмаған.'; return; }
    el('loginButton').disabled = true;
    el('teacherStatus').textContent = 'Кіру тексеріліп жатыр…';
    try {
      const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: el('email').value.trim(), password: el('password').value }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error('login');
      const session = await response.json();
      token = session.access_token;
      const permission = await fetch(`${config.url}/rest/v1/refraction_teachers?select=user_id&limit=1`, { headers: headers(), signal: AbortSignal.timeout(20000) });
      if (!permission.ok || !(await permission.json()).length) { logout('Бұл аккаунтқа мұғалім рұқсаты берілмеген.'); return; }
      el('password').value = '';
      el('loginSection').hidden = true;
      el('dashboard').hidden = false;
      page = 0;
      await loadReports();
    } catch {
      logout('Кіру сәтсіз. Поштаңызды, құпиясөзіңізді және қосылымды тексеріңіз.');
    } finally { el('loginButton').disabled = false; }
  });
  el('logout').onclick = async () => {
    const oldToken = token;
    logout();
    if (oldToken) {
      try { await fetch(`${config.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: config.publishableKey, Authorization: `Bearer ${oldToken}` }, signal: AbortSignal.timeout(10000) }); } catch { /* Local session was already cleared. */ }
    }
  };
  el('refresh').onclick = loadReports;
  el('previousPage').onclick = () => { if (page > 0) { page--; loadReports(); } };
  el('nextPage').onclick = () => { page++; loadReports(); };
  el('classFilter').oninput = () => { clearTimeout(filterTimer); filterTimer = setTimeout(() => { page = 0; loadReports(); }, 300); };
})();
