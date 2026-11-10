/* Glacière – landingspagina
   1. Soepel scrollen naar ankers (respecteert prefers-reduced-motion)
   2. Kleine animatie bij scrollen
   3. Inschrijfformulier: validatie en verzenden naar MailerLite */
(function () {
  'use strict';

  var minderBeweging = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* 1. Soepel scrollen + focus naar het doel (toetsenbord en schermlezer) */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var id = link.getAttribute('href').slice(1);
    var doel = id && document.getElementById(id);
    if (!doel) return;
    e.preventDefault();
    // Link naar een vraag (bv. Privacy): eerst openklappen
    if (link.hasAttribute('data-open-vraag') && doel.tagName === 'DETAILS') {
      doel.open = true;
      doel = doel.querySelector('summary') || doel;
    }
    doel.scrollIntoView({ behavior: minderBeweging.matches ? 'auto' : 'smooth', block: 'start' });
    if (!doel.hasAttribute('tabindex') && doel.tagName !== 'SUMMARY') doel.setAttribute('tabindex', '-1');
    doel.focus({ preventScroll: true });
    history.replaceState(null, '', '#' + id);
  });

  /* 2. Onthullen bij scrollen
     - [data-onthul]: een groep. Komt de groep in beeld, dan verschijnen alle .onthul
       erin na elkaar (--i bepaalt de vertraging, 80 ms per stap in de CSS).
     - .onthul buiten een groep en .teken (lijnen die zich tekenen) worden apart bekeken. */
  var groepen = document.querySelectorAll('[data-onthul]');
  groepen.forEach(function (groep) {
    groep.querySelectorAll('.onthul').forEach(function (el, i) { el.style.setProperty('--i', i); });
  });
  var losse = Array.prototype.filter.call(document.querySelectorAll('.onthul, .teken'), function (el) {
    return !el.closest('[data-onthul]');
  });
  var doelen = Array.prototype.slice.call(groepen).concat(losse);

  function onthulNu(el) {
    el.classList.add('is-zichtbaar');
    if (el.hasAttribute('data-onthul')) {
      el.querySelectorAll('.onthul').forEach(function (k) { k.classList.add('is-zichtbaar'); });
    }
  }

  if (minderBeweging.matches || !('IntersectionObserver' in window)) {
    doelen.forEach(onthulNu);
  } else {
    var waarnemer = new IntersectionObserver(function (items) {
      items.forEach(function (item) {
        if (item.isIntersecting) {
          onthulNu(item.target);
          waarnemer.unobserve(item.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    doelen.forEach(function (el) { waarnemer.observe(el); });
  }

  /* Video: speelt vanzelf, stil en in een lus, zodra hij in beeld komt.
     Buiten beeld pauzeert hij (spaart data en batterij) en hervat hij als hij terugkomt.
     Pauzeert de bezoeker zelf, dan blijft hij gepauzeerd. Bij prefers-reduced-motion
     start hij niet vanzelf; play blijft wel mogelijk. */
  var film = document.querySelector('.video__film');
  if (film && !minderBeweging.matches) {
    var zelfGepauzeerd = false;
    var doorScript = false;
    var gepland = false;

    film.addEventListener('pause', function () { if (!doorScript) zelfGepauzeerd = true; doorScript = false; });
    film.addEventListener('play', function () { zelfGepauzeerd = false; });

    function zichtbaarDeel() {
      var r = film.getBoundingClientRect();
      var hoogte = r.height || 1;
      var zichtbaar = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      return Math.max(0, zichtbaar) / hoogte;
    }

    function controleer() {
      gepland = false;
      var inBeeld = zichtbaarDeel() >= 0.25;
      if (inBeeld && film.paused && !zelfGepauzeerd) {
        var p = film.play();
        if (p && p.catch) p.catch(function () { /* autoplay geweigerd: bediening blijft zichtbaar */ });
      } else if (!inBeeld && !film.paused) {
        doorScript = true;
        film.pause();
      }
    }

    function plan() {
      if (!gepland) { gepland = true; window.requestAnimationFrame(controleer); }
    }

    window.addEventListener('scroll', plan, { passive: true });
    window.addEventListener('resize', plan);
    controleer();
  }

  /* 3. Formulier */
  var form = document.getElementById('ml-formulier');
  if (!form) return;
  form.setAttribute('novalidate', '');

  var naam = document.getElementById('veld-naam');
  var email = document.getElementById('veld-email');
  var optin = document.getElementById('veld-optin');
  var foutAlgemeen = document.getElementById('fout-algemeen');
  var knop = form.querySelector('button[type="submit"]');
  var emailPatroon = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var controles = [
    { veld: naam, fout: 'fout-naam', ok: function () { return naam.value.trim().length > 0; } },
    { veld: email, fout: 'fout-email', ok: function () { return emailPatroon.test(email.value.trim()); } },
    { veld: optin, fout: 'fout-optin', ok: function () { return optin.checked; } }
  ];

  function toon(controle, geldig) {
    document.getElementById(controle.fout).hidden = geldig;
    if (geldig) controle.veld.removeAttribute('aria-invalid');
    else controle.veld.setAttribute('aria-invalid', 'true');
  }

  // Fout weghalen zodra het veld klopt
  controles.forEach(function (c) {
    var evt = c.veld.type === 'checkbox' ? 'change' : 'input';
    c.veld.addEventListener(evt, function () {
      if (c.veld.getAttribute('aria-invalid') === 'true' && c.ok()) toon(c, true);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    foutAlgemeen.hidden = true;

    var eersteFout = null;
    controles.forEach(function (c) {
      var geldig = c.ok();
      toon(c, geldig);
      if (!geldig && !eersteFout) eersteFout = c.veld;
    });
    if (eersteFout) { eersteFout.focus(); return; }

    var knopTekst = knop.textContent;
    knop.setAttribute('aria-busy', 'true');
    knop.disabled = true;
    knop.textContent = 'Even geduld…';

    // Verzenden naar MailerLite: ongewijzigd. Enkel de overgang naar de bevestiging is nieuw.
    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || data.success !== true) throw new Error('MailerLite: geen succes');
        var blok = document.getElementById('formulier-blok');
        var succes = document.getElementById('succes-blok');
        // Kaart behoudt haar hoogte, zodat de pagina niet verspringt
        blok.parentElement.style.minHeight = blok.parentElement.offsetHeight + 'px';
        blok.classList.add('is-weg');
        window.setTimeout(function () {
          blok.hidden = true;
          succes.hidden = false;
          document.getElementById('succes-titel').focus();
        }, minderBeweging.matches ? 0 : 220);
      })
      .catch(function () {
        foutAlgemeen.hidden = false;
        knop.disabled = false;
        knop.removeAttribute('aria-busy');
        knop.textContent = knopTekst;
      });
  });
})();
