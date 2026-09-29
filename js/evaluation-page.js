/* Display saved, claim-specific predictions; never invent inference results. */
(function () {
  'use strict';
  const select = document.getElementById('evaluationClaim');
  const status = document.getElementById('evaluationStatus');
  const button = document.getElementById('runModels');
  let claims = [], loading = false;
  function prediction(claim, kind) {
    if (!claim) return null;
    const raw = kind === 'python' ? claim.pythonResult || claim.pythonPrediction || claim.evaluation?.python : claim.teachableMachineResult || claim.teachableMachinePrediction || claim.evaluation?.teachableMachine;
    if (!raw) return null;
    const label = typeof raw === 'string' ? raw : raw.label || raw.decision || raw.result || raw.className || raw.prediction;
    let value = typeof raw === 'object' ? raw.confidence ?? raw.score ?? raw.probability ?? raw.confidenceScore : null;
    let confidence = value == null || value === '' ? NaN : Number(value);
    if (confidence > 1 && confidence <= 100) confidence /= 100;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) confidence = null;
    return { label: label ? String(label) : 'Not evaluated', confidence };
  }
  function render() {
    const claim = claims.find(c => c.id === select.value);
    const results = [prediction(claim, 'python'), prediction(claim, 'tm')];
    document.querySelectorAll('.evaluation-card').forEach((card, i) => {
      const r = results[i];
      card.querySelector('.prediction strong').textContent = r?.label || 'Not evaluated';
      card.querySelector('.prediction span').textContent = r?.confidence != null ? Math.round(r.confidence * 100) + '%' : '—';
      card.querySelector('.progress i').style.width = (r?.confidence != null ? r.confidence * 100 : 0) + '%';
    });
    const [a, b] = results;
    const complete = a && b && a.confidence != null && b.confidence != null;
    document.querySelector('.comparison-card h2').textContent = complete ? (a.label.toLowerCase() === b.label.toLowerCase() ? 'Matching predictions' : 'Model disagreement') : 'No comparison yet';
    document.querySelector('.comparison-score strong').textContent = complete ? Math.round(Math.abs(a.confidence - b.confidence) * 100) + '%' : '—';
    document.querySelector('.comparison-card p').textContent = complete ? 'Comparison of the saved results for this claim.' : 'Both models need saved predictions and confidence scores.';
  }
  async function load() {
    if (loading) return;
    if (!window.fbAuth?.currentUser) { select.replaceChildren(new Option('Sign in to view claims', '')); status.textContent = 'Sign in to view saved assessments.'; return; }
    loading = true; button.disabled = true; select.disabled = true;
    status.textContent = 'Loading saved assessments…';
    const previous = select.value;
    try {
      claims = await DbService.getClaims();
      select.replaceChildren(new Option(claims.length ? 'Choose a claim' : 'No claims available', ''));
      claims.forEach(c => select.add(new Option(String(c.claimId || c.claimNumber || c.id), c.id)));
      if (claims.some(c => c.id === previous)) select.value = previous;
      status.textContent = claims.length ? 'Select a claim. These are saved results; refresh does not run inference.' : 'No claims are available for this account.';
    } catch (_) {
      claims = []; select.replaceChildren(new Option('Unable to load claims', ''));
      status.textContent = 'Could not load assessments. Check your connection and refresh saved results.';
    } finally { loading = false; button.disabled = false; select.disabled = !claims.length; render(); }
  }
  select.addEventListener('change', render); button.addEventListener('click', load);
  if (window.fbAuth) fbAuth.onAuthStateChanged(load); else load();
})();
