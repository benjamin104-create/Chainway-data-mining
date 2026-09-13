/* 線條圖示：24×24，只用 stroke，顏色交給 CSS */
window.G = window.G || {};

const I = {
  slash:   '<path d="M4 20 L20 4"/><path d="M14 4h6v6"/>',
  shield:  '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/>',
  speed:   '<path d="M3 8h9"/><path d="M3 12h13"/><path d="M3 16h7"/><path d="M17 6l4 6-4 6"/>',
  quake:   '<path d="M2 17l4-6 3 4 4-9 3 7 2-3 4 7"/><path d="M2 21h20"/>',
  cleave:  '<path d="M5 19L19 5"/><path d="M9 19L19 9"/><path d="M15 5h4v4"/>',
  tower:   '<path d="M7 21V9l5-5 5 5v12z"/><path d="M7 9h10"/><path d="M10 21v-5h4v5"/>',
  anchor:  '<circle cx="12" cy="5" r="2.2"/><path d="M12 7v13"/><path d="M5 13a7 7 0 0014 0"/><path d="M8 12H5m14 0h-3"/>',
  roar:    '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8a6 6 0 010 8"/><path d="M20 5a10 10 0 010 14"/>',
  crit:    '<path d="M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z"/>',
  thorns:  '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/><path d="M9 12l3-3 3 3-3 3z"/>',
  spin:    '<path d="M20 12a8 8 0 11-3-6.2"/><path d="M21 3v5h-5"/>',
  execute: '<path d="M6 3l12 12"/><path d="M18 3L6 15"/><path d="M9 18l3 3 3-3"/>',
  gate:    '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-7a3 3 0 016 0v7"/>',
  shard:   '<path d="M13 2L4 13h6l-1 9 9-11h-6z"/>',
  range:   '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  cdr:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  burn:    '<path d="M12 21c4 0 6-2.7 6-6 0-4-3-6-3-9 0 0-2 2-2 4.5 0 0-2-1.5-2-4.5-2 2-5 5-5 9 0 3.3 2 6 6 6z"/>',
  wall:    '<path d="M3 8h18M3 13h18M3 18h18"/><path d="M8 8V3m8 5V3M6 13V8m6 5V8m6 5V8M9 18v-5m6 5v-5"/>',
  wave:    '<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M2 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
  stack:   '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  beam:    '<path d="M2 12h20"/><path d="M6 8v8m4-10v12m4-10v8m4-6v4"/>',
  echo:    '<circle cx="12" cy="12" r="2.5"/><path d="M7 7a7 7 0 000 10"/><path d="M17 7a7 7 0 010 10"/>',
  dash:    '<path d="M14 3l-7 9h5l-2 9 7-10h-5z"/><path d="M3 7h3M2 12h3M3 17h3"/>',
  mark:    '<circle cx="12" cy="12" r="7"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="1.6"/>',
  life:    '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0112 8a4 4 0 017 2.5C19 15.6 12 20 12 20z"/>',
  combo:   '<path d="M4 18L10 6l3 6 2-3 5 9"/><path d="M3 21h18"/>',
  summon:  '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5"/><path d="M11 20c0-3 2.2-5 5-5s5 2 5 5"/>',
  heal:    '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/>',
  flare:   '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2M19 5l-2 2M7 17l-2 2"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  rally:   '<path d="M12 3v12"/><path d="M12 3l8 3-8 3"/><path d="M6 21h12"/><path d="M9 15h6"/>',
  cave:    '<path d="M3 21V15a9 9 0 0118 0v6"/><path d="M9 21v-5a3 3 0 016 0v5"/><path d="M3 21h18"/>',
  herb:    '<path d="M12 21V9"/><path d="M12 13c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z"/><path d="M12 17c0-2.8-2.2-5-5-5 0 2.8 2.2 5 5 5z"/>',
  trap:    '<path d="M4 4l4 4m8-4l-4 4"/><path d="M3 11h18l-2 9H5z"/><path d="M8 11l1.5 9M16 11l-1.5 9"/>',
  flame:   '<path d="M12 21c3.3 0 5.5-2.2 5.5-5.2 0-3.6-2.8-5.3-3.2-8.8-1.6 1.3-2.3 2.8-2.3 4.4-1-.7-1.6-1.8-1.6-3.1C8.2 10 6.5 12.4 6.5 15.8 6.5 18.8 8.7 21 12 21z"/>'
};

G.icon = function (name, cls) {
  const body = I[name] || I.crit;
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
};
