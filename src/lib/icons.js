// icons.js — 라인 SVG 아이콘 세트 (디자인 시스템 Icon.dc.html 재현)
// 패널·팝업 공용. 이모지 대체. stroke=currentColor라 색은 부모에서 제어.

const PATHS = {
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  clock: '<path d="M12 7.5V12l3 1.8M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z"/>',
  pencil: '<path d="M4 20h4L18.5 9.5l-4-4L4 16zM13.5 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 12.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1L18 7"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3M20.5 4.2v4.3h-4.3"/>',
  grip: '<path stroke-width="2.4" d="M9 5.5v.01M9 12v.01M9 18.5v.01M15 5.5v.01M15 12v.01M15 18.5v.01"/>',
  keyboard: '<rect x="2.5" y="7" width="19" height="10" rx="1.8"/><path stroke-width="2.2" d="M6 11v.01M9.5 11v.01M13 11v.01M16.5 11v.01"/><path d="M8 14.2h8"/>',
  search: '<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4.2-4.2"/>',
  chart: '<path d="M3 20.5h18M6.5 20.5v-6M11.5 20.5V8M16.5 20.5v-9"/>',
  chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
  chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  alert: '<path d="M12 3.5l9.2 16H2.8zM12 9.5v4.5M12 17.5v.01"/>',
  broom: '<path d="M14.5 3.5l6 6-5 5-6-6zM10 11l-5.5 5.5V20.5h4l5.5-5.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  heart: '<path d="M12 20s-7-4.7-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.3-7 10-7 10z"/>',
  play: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM10.5 9.2l4.5 2.8-4.5 2.8z"/>',
  chat: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-5l-4 3v-3H6.5A2.5 2.5 0 0 1 4 13.5z"/>',
  coffee: '<path d="M4 8.5h13v3.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM17 9.5h2a2 2 0 0 1 0 4h-2M7.5 4v2M11 4v2"/>',
  sparkle: '<path d="M12 4l1.7 4.6 4.6 1.7-4.6 1.7L12 16.6l-1.7-4.6L5.7 10.3l4.6-1.7z"/>',
  layers: '<path d="M12 3l8 4.5-8 4.5-8-4.5zM4 12l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A2.5 2.5 0 0 0 6.5 10M17 6h3v1.5A2.5 2.5 0 0 1 17.5 10M9.5 14h5M12 14v3.5M8.5 20.5h7l-1-3h-5z"/>',
  pin: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11zM12 9.5v.01"/>',
  link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5"/>',
  upload: '<path d="M12 16V4M7.5 8.5L12 4l4.5 4.5M5 20h14"/>',
  download: '<path d="M12 4v12M7.5 11.5L12 16l4.5-4.5M5 20h14"/>',
}

/** 아이콘 SVG HTML 문자열. @param {string} name @param {number} size px */
export function icon(name, size = 16) {
  return `<svg class="ba-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">${PATHS[name] || ''}</svg>`
}
