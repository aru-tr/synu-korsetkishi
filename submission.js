'use strict';
(() => {
  const form = document.getElementById('submissionForm');
  const status = document.getElementById('submissionStatus');
  const button = document.getElementById('submitReport');
  let pending = null;
  let sent = null;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const studentName = document.getElementById('studentName').value.trim();
    const studentClass = document.getElementById('studentClass').value.trim();
    const conclusion = document.getElementById('conclusion').value.trim();
    if (studentName.length < 2 || studentName.length > 120 || !studentClass || studentClass.length > 40) {
      status.textContent = 'Аты-жөніңізді және сыныбыңызды толық енгізіңіз.';
      return;
    }
    if (state.rows.length !== 2 || !conclusion || conclusion.length > 10000) {
      status.textContent = 'Алдымен екі тәжірибені орындап, қорытынды жазыңыз (10 000 таңбаға дейін).';
      return;
    }
    const config = window.LAB_SUPABASE;
    if (!config?.publishableKey) {
      status.textContent = 'Онлайн жіберу әлі қосылмаған. Әзірге есепті жүктеп, мұғалімге файлмен жіберіңіз.';
      return;
    }
    const content = { student_name: studentName, student_class: studentClass, results: state.rows, conclusion };
    const fingerprint = JSON.stringify(content);
    if (sent === fingerprint) {
      status.textContent = 'Бұл жауап сәтті жіберілген. Мұғалім оны панельден көре алады.';
      return;
    }
    // Retain the same ID after an uncertain network response so retrying is idempotent.
    if (!pending || pending.fingerprint !== fingerprint) {
      pending = { fingerprint, report: { ...JSON.parse(fingerprint), id: crypto.randomUUID() } };
    }
    const attempt = pending;
    button.disabled = true;
    status.textContent = 'Жауап жіберіліп жатыр…';
    try {
      const response = await fetch(`${config.url}/rest/v1/rpc/submit_refraction_report`, {
        method: 'POST',
        headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: attempt.report }),
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const savedId = await response.json();
      if (savedId !== attempt.report.id) throw new Error('Unexpected save response');
      sent = attempt.fingerprint;
      status.textContent = '✓ Жауабыңыз сақталды! Мұғалім оны панельден көре алады.';
    } catch {
      status.textContent = 'Жіберу расталмады. Интернетті тексеріп, қайта басыңыз. Жауаптарыңыз осы бетте сақталып тұр; файл ретінде де жүктей аласыз.';
    } finally {
      button.disabled = false;
    }
  });
})();
