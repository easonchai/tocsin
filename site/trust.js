/* A quiet, timed walkthrough. All examples remain in the page source. */
(function () {
  var tour = document.querySelector('[data-trust-tour]');
  if (!tour) return;

  var steps = Array.from(tour.querySelectorAll('[role="tab"]'));
  var panels = Array.from(tour.querySelectorAll('[role="tabpanel"]'));
  var bars = steps.map(function (step) { return step.querySelector('.step-track > span'); });
  var toggle = tour.querySelector('[data-trust-toggle]');
  var count = tour.querySelector('[data-trust-count]');
  var layout = tour.querySelector('.trust-layout');
  var motion = matchMedia('(prefers-reduced-motion: reduce)');
  var duration = 9000, active = 0, elapsed = 0, lastTime = 0, frame = 0;
  var playing = !motion.matches, visible = false, focused = false, pointerFocus = false;
  var horizontal = matchMedia('(max-width: 900px)');

  function setBeat() {
    var time = motion.matches ? duration : elapsed;
    var panel = panels[active];
    function clamp(value) { return Math.max(0, Math.min(1, value)); }
    panel.dataset.beat = String(Math.min(2, Math.floor(time / 2800)));
    panel.style.setProperty('--draw-a', 1 - clamp((time - 400) / 2400));
    panel.style.setProperty('--draw-b', 1 - clamp((time - 3200) / 2400));
    panel.style.setProperty('--travel-a', clamp((time - 400) / 2400));
    panel.style.setProperty('--travel-b', clamp((time - 5600) / 1000));
    panel.style.setProperty('--packet-a', time > 400 && time < 2800 ? 1 : 0);
    panel.style.setProperty('--packet-b', time > 5600 && time < 6600 ? 1 : 0);
  }

  function select(index) {
    active = (index + steps.length) % steps.length;
    elapsed = 0;
    steps.forEach(function (step, i) {
      step.setAttribute('aria-selected', String(i === active));
      step.tabIndex = i === active ? 0 : -1;
      panels[i].hidden = i !== active;
      bars[i].style.transform = 'scaleX(0)';
    });
    count.textContent = '0' + (active + 1) + ' / 0' + steps.length;
    setBeat();
  }

  function canRun() { return playing && visible && !focused && !document.hidden; }

  function tick(now) {
    frame = 0;
    if (!canRun()) return;
    elapsed += now - lastTime;
    lastTime = now;
    if (elapsed >= duration) select(active + 1);
    setBeat();
    bars[active].style.transform = 'scaleX(' + elapsed / duration + ')';
    frame = requestAnimationFrame(tick);
  }

  function syncTimer() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (canRun()) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  function showPlayback() {
    toggle.innerHTML = playing ? 'Pause <span aria-hidden="true">Ⅱ</span>' : 'Play <span aria-hidden="true">▷</span>';
    toggle.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' automatic trust-list steps');
    syncTimer();
  }

  steps.forEach(function (step, i) {
    step.addEventListener('click', function (event) {
      select(i);
      if (event.detail > 0) focused = false;
      syncTimer();
    });
    step.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = i + 1;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = i - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = steps.length - 1;
      else return;
      event.preventDefault();
      focused = true;
      select(next);
      steps[active].focus();
      syncTimer();
    });
  });
  toggle.addEventListener('click', function () { playing = !playing; showPlayback(); });
  layout.addEventListener('pointerdown', function () { pointerFocus = true; focused = false; syncTimer(); });
  layout.addEventListener('click', function () { pointerFocus = false; });
  layout.addEventListener('focusin', function () { focused = !pointerFocus; syncTimer(); });
  layout.addEventListener('focusout', function (event) { focused = layout.contains(event.relatedTarget); syncTimer(); });
  document.addEventListener('visibilitychange', syncTimer);
  motion.addEventListener('change', function () { if (motion.matches) { playing = false; setBeat(); showPlayback(); } });
  function setOrientation() { tour.querySelector('[role="tablist"]').setAttribute('aria-orientation', horizontal.matches ? 'horizontal' : 'vertical'); }
  horizontal.addEventListener('change', setOrientation);

  new IntersectionObserver(function (entries) {
    visible = entries[0].intersectionRatio >= 0.25;
    syncTimer();
  }, { threshold: 0.25 }).observe(layout);

  select(0);
  setOrientation();
  showPlayback();
})();
