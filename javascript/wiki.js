(function () {
  'use strict';

  var GUIDES = [
    { t: 'Getting started', u: 'getting-started.html', c: 'New players', i: 'gift', d: 'Join, your first ten minutes and what to do next.', k: 'new join first starter kit wild rtp how to play beginner' },
    { t: 'Spawn map', u: 'spawn.html', c: 'New players', i: 'compass', d: 'Every NPC, warp and spot at spawn on one map.', k: 'map hub npc warps arena pond spawn' },
    { t: 'Commands', u: 'commands.html', c: 'New players', i: 'chat', d: 'Every command you can type, and what it does.', k: 'commands list help slash' },
    { t: 'Rules and fair play', u: 'rules.html', c: 'New players', i: 'warning', d: 'What gets you warned, muted or banned.', k: 'rules ban mute hacking duping alts afk' },
    { t: 'Lifesteal and hearts', u: 'lifesteal.html', c: 'Survival', i: 'lifesteal_heart', d: 'Hearts, the 30 heart cap, dying out and revives.', k: 'hearts revive soul withdraw eliminated spectator lives' },
    { t: 'Combat and safe zones', u: 'combat.html', c: 'Survival', i: 'sword', d: 'Where PvP is on, combat tags and combat logging.', k: 'pvp combat log tag safe zone spawn protection death tax' },
    { t: 'Homes and teleports', u: 'teleports.html', c: 'Survival', i: 'tpa', d: 'Homes, TPA, warps, /wild and /back.', k: 'home sethome tpa warp wild rtp back spawn teleport' },
    { t: 'The world', u: 'world.html', c: 'Survival', i: 'globe', d: 'World border, the Nether, the End and build limits.', k: 'border nether end dimension build zone' },
    { t: 'Coins and earning', u: 'money.html', c: 'Money', i: 'money', d: 'How coins work and the best ways to earn them.', k: 'money coins balance pay earn baltop' },
    { t: 'Shop and selling', u: 'shop.html', c: 'Money', i: 'shop', d: 'Buy and sell prices for everything in /shop.', k: 'shop sell prices buy autosell' },
    { t: 'Trading and bounties', u: 'trading.html', c: 'Money', i: 'coins_transfer', d: 'Trades, auctions, sending coins and bounties.', k: 'trade auction ah pay bounty' },
    { t: 'Crates and keys', u: 'crates.html', c: 'Money', i: 'key_common', d: 'Every crate, how to get keys and what is inside.', k: 'crate keys common epic mythic loot odds goodie bag' },
    { t: 'Spawners', u: 'spawners.html', c: 'Money', i: 'spawner', d: 'Smart spawners, stacking and their storage.', k: 'spawner stack mob drops xp' },
    { t: 'Kits', u: 'kits.html', c: 'Money', i: 'closed_chest', d: 'The starter kit, the Discord Kit and the store kits.', k: 'kit starter discord store cooldown' },
    { t: 'Skills', u: 'skills.html', c: 'Progression', i: 'pickaxe', d: 'Five skills to level 30, their perks and the pet crab.', k: 'skills mining woodcutting farming combat fishing xp perk pet crab' },
    { t: 'Battle pass and quests', u: 'battlepass.html', c: 'Progression', i: 'pass_star', d: '100 tiers a season and the daily quests that fill them.', k: 'battlepass bp quests daily premium tiers points season' },
    { t: 'Fishing', u: 'fishing.html', c: 'Progression', i: 'fish', d: 'The seven rods and what the spawn pond gives.', k: 'fishing rods pond loot legendary' },
    { t: 'Crab and Nexus gear', u: 'gear.html', c: 'Progression', i: 'crab_chestplate', d: 'Custom armour and tools, their abilities and drops.', k: 'crab nexus gear armour sword pickaxe 3x3 lightning' },
    { t: 'Cosmetics', u: 'cosmetics.html', c: 'Progression', i: 'elytra', d: 'Wings, halos, capes, pets, voids and emotes.', k: 'cosmetics wings halo cape pet void emotes bundles' },
    { t: 'Plushies, heads and the podium', u: 'collectibles.html', c: 'Progression', i: 'daily_rewards', d: 'Plushies, player heads and the top three statues.', k: 'plushies heads podium leaderboard statue' },
    { t: 'Factions', u: 'factions.html', c: 'PvP and teams', i: 'clan', d: 'Make a faction, share a bank and go to war.', k: 'faction team clan bank war wager members' },
    { t: 'Duels', u: 'duels.html', c: 'PvP and teams', i: 'duel', d: 'Duels, kits, betting, ranked and custom kits.', k: 'duel ranked elo kits bet shards custom kit arena' },
    { t: 'Events', u: 'events.html', c: 'PvP and teams', i: 'crown_gold', d: 'King of the Hill, the Fallen Knight and loot drops.', k: 'koth king of the hill boss fallen knight loot drop event' },
    { t: 'Ranks and the store', u: 'ranks.html', c: 'The server', i: 'rank_crabdemon', d: 'What each rank gives and how purchases arrive.', k: 'ranks store crabplus crabextra crabdemon buy tebex purchase' },
    { t: 'Voting', u: 'voting.html', c: 'The server', i: 'star', d: 'Where to vote and what each vote pays.', k: 'vote voting rewards sites' },
    { t: 'Discord', u: 'discord.html', c: 'The server', i: 'discord', d: 'Link your account and what linking gives you.', k: 'discord link account verify' },
    { t: 'Getting help', u: 'help.html', c: 'The server', i: 'help', d: 'Reports, appeals, bugs and talking to staff.', k: 'help support report appeal ticket staff bug data request' },
    { t: 'History of CrabSMP', u: 'history.html', c: 'The server', i: 'clock', d: 'From one Realm in 2022 to the server today.', k: 'history realm nexus ozz smoothie' }
  ];

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function words(q) {
    return q.toLowerCase().replace(/[^a-z0-9/ ]+/g, ' ').split(/\s+/).filter(Boolean);
  }

  function hay(g) {
    return (g.t + ' ' + g.c + ' ' + g.d + ' ' + g.k).toLowerCase();
  }

  function rank(q) {
    var tokens = words(q);
    if (!tokens.length) return GUIDES.slice();
    var phrase = tokens.join(' ');
    return GUIDES.map(function (g, i) {
      var text = hay(g);
      for (var j = 0; j < tokens.length; j++) {
        if (text.indexOf(tokens[j]) === -1) return null;
      }
      var title = g.t.toLowerCase();
      var score = title.indexOf(phrase) === 0 ? 0 : title.indexOf(phrase) !== -1 ? 1 :
        (' ' + g.k.toLowerCase() + ' ').indexOf(' ' + phrase) !== -1 ? 2 : 3;
      return { g: g, s: score, i: i };
    }).filter(Boolean).sort(function (a, b) {
      return a.s - b.s || a.i - b.i;
    }).map(function (r) { return r.g; });
  }

  function slot(icon) {
    var s = el('span', 'icon-slot icon-slot--sm icon-slot--dark');
    var img = el('img', 'glyph glyph--1');
    img.src = '../media/icons/glyph/' + icon + '.png';
    img.alt = '';
    s.appendChild(img);
    return s;
  }

  function initSearch() {
    if (!GUIDES.length || !window.HTMLDialogElement) return;

    var dialog = el('dialog', 'search');
    dialog.setAttribute('aria-label', 'Search the wiki');
    var field = el('div', 'search__field');
    var glass = el('i', 'i i-search');
    glass.setAttribute('aria-hidden', 'true');
    var input = el('input');
    input.type = 'search';
    input.placeholder = 'Search guides, commands, items';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'search-list');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-label', 'Search the wiki');
    var list = el('div', 'search__list');
    list.id = 'search-list';
    list.setAttribute('role', 'listbox');
    var foot = el('p', 'search__foot');
    foot.innerHTML = '<span>Enter to open</span><span>Arrow keys to move</span><span>Esc to close</span>';
    field.appendChild(glass);
    field.appendChild(input);
    dialog.appendChild(field);
    dialog.appendChild(list);
    dialog.appendChild(foot);
    document.body.appendChild(dialog);

    var results = [];
    var active = 0;

    function select(i, scroll) {
      var items = $$('.search__item', list);
      if (!items.length) { input.removeAttribute('aria-activedescendant'); return; }
      active = (i + items.length) % items.length;
      items.forEach(function (it, j) { it.setAttribute('aria-selected', j === active ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', items[active].id);
      if (scroll) items[active].scrollIntoView({ block: 'nearest' });
    }

    function draw() {
      results = rank(input.value);
      list.textContent = '';
      if (!results.length) {
        list.appendChild(el('p', 'search__empty', 'Nothing found. Try a shorter word, or ask in the Discord.'));
        select(0);
        return;
      }
      results.forEach(function (g, i) {
        var a = el('a', 'search__item');
        a.href = g.u;
        a.id = 'search-opt-' + i;
        a.setAttribute('role', 'option');
        a.appendChild(slot(g.i));
        a.appendChild(el('strong', '', g.t));
        a.appendChild(el('span', '', g.d));
        a.appendChild(el('em', '', g.c));
        a.addEventListener('mousemove', function () { if (active !== i) select(i); });
        list.appendChild(a);
      });
      select(0);
    }

    function open() {
      if (dialog.open) return;
      input.value = '';
      draw();
      dialog.showModal();
      input.focus();
    }

    input.addEventListener('input', draw);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1, true); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1, true); }
      else if (e.key === 'Enter' && results[active]) { e.preventDefault(); location.href = results[active].u; }
      else if (e.key === 'Escape') { e.preventDefault(); dialog.close(); }
    });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-search]');
      if (!btn) return;
      e.preventDefault();
      open();
    });
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        open();
      }
    });
  }

  function initFinder() {
    var input = $('[data-finder]');
    var catalog = $('.catalog');
    if (!input || !catalog) return;
    var count = $('[data-finder-count]');
    var empty = $('.catalog__empty');
    var links = $$('.guide-link', catalog);

    function apply() {
      var tokens = words(input.value);
      var shown = 0;
      links.forEach(function (a) {
        var text = (a.textContent + ' ' + (a.getAttribute('data-keys') || '')).toLowerCase();
        var on = tokens.every(function (w) { return text.indexOf(w) !== -1; });
        a.parentNode.hidden = !on;
        if (on) shown++;
      });
      $$('.catalog__group', catalog).forEach(function (group) {
        group.hidden = !$$('li:not([hidden])', group).length;
      });
      if (count) count.textContent = shown === links.length ? links.length + ' guides' : shown + ' of ' + links.length;
      if (empty) empty.hidden = shown > 0;
    }
    input.addEventListener('input', apply);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; apply(); }
    });
    apply();
  }

  function initTableFilters() {
    $$('[data-table-filter]').forEach(function (input) {
      var table = document.getElementById(input.getAttribute('data-table-filter'));
      if (!table) return;
      var count = $('[data-table-count="' + table.id + '"]');
      var bodies = $$('tbody', table);
      var rows = $$('tbody tr:not(.table__group)', table);
      rows.forEach(function (tr) { tr._text = tr.textContent.toLowerCase(); });

      function apply() {
        var tokens = words(input.value);
        var shown = 0;
        rows.forEach(function (tr) {
          var on = tokens.every(function (w) { return tr._text.indexOf(w) !== -1; });
          tr.hidden = !on;
          if (on) shown++;
        });
        bodies.forEach(function (body) {
          body.hidden = !$$('tr:not(.table__group):not([hidden])', body).length;
        });
        if (count) count.textContent = shown === rows.length ? rows.length + ' items' : shown + ' of ' + rows.length;
      }
      input.addEventListener('input', apply);
      apply();
    });
  }

  function initDeal() {
    var catalog = $('.catalog');
    if (!catalog || reduceMotion || !('IntersectionObserver' in window)) return;
    var links = $$('.guide-link', catalog);
    links.forEach(function (a, i) { a.style.setProperty('--d', String(i)); });
    function done() {
      catalog.classList.remove('is-dealing');
      links.forEach(function (a) { a.style.removeProperty('--d'); });
    }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      catalog.classList.add('is-dealing');
      setTimeout(done, links.length * 28 + 1000);
    }, { threshold: 0.05 });
    var finder = $('[data-finder]');
    if (finder) finder.addEventListener('input', function () { io.disconnect(); done(); });
    io.observe(catalog);
  }

  function initSubnav() {
    var nav = $('.subnav');
    if (!nav) return;
    var track = $('.subnav__track', nav);
    var mark = el('span', 'subnav__mark');
    mark.setAttribute('aria-hidden', 'true');
    track.appendChild(mark);
    var links = $$('a', track);

    function place() {
      var on = $('a[aria-current]', track);
      if (!on) { mark.style.opacity = '0'; return; }
      var x = on.offsetLeft + (on === links[0] ? 0 : 14);
      var w = on.offsetWidth - (on === links[0] ? 14 : 28);
      mark.style.opacity = '1';
      mark.style.transform = 'translateX(' + x + 'px) scaleX(' + Math.max(w, 1) + ')';
      var left = on.offsetLeft - 24;
      var right = on.offsetLeft + on.offsetWidth + 24 - track.clientWidth;
      if (track.scrollLeft > left) track.scrollTo({ left: left, behavior: reduceMotion ? 'auto' : 'smooth' });
      else if (track.scrollLeft < right) track.scrollTo({ left: right, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    new MutationObserver(place).observe(track, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
    if ('ResizeObserver' in window) new ResizeObserver(place).observe(track);
    else window.addEventListener('resize', place);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    place();
  }

  function initPager() {
    var box = $('[data-pager]');
    if (!box || !GUIDES.length) return;
    var file = location.pathname.split('/').pop() || 'index.html';
    var at = -1;
    GUIDES.forEach(function (g, i) { if (g.u === file) at = i; });
    if (at === -1) return;

    function link(g, rel) {
      var a = el('a');
      a.href = g.u;
      a.rel = rel;
      var arrow = el('i', 'i ' + (rel === 'prev' ? 'i-arrow-left' : 'i-arrow-right'));
      arrow.setAttribute('aria-hidden', 'true');
      var text = el('span');
      text.appendChild(el('small', '', rel === 'prev' ? 'Previous guide' : 'Next guide'));
      text.appendChild(el('strong', '', g.t));
      a.appendChild(arrow);
      a.appendChild(text);
      return a;
    }
    if (at > 0) box.appendChild(link(GUIDES[at - 1], 'prev'));
    if (at < GUIDES.length - 1) box.appendChild(link(GUIDES[at + 1], 'next'));
  }

  function start() {
    initSearch();
    initFinder();
    initTableFilters();
    initDeal();
    initSubnav();
    initPager();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
