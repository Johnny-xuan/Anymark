(function(){let e=null,a=!1,r=0,l=0,s=0,c=0;function u(){try{return!!(chrome&&chrome.runtime&&chrome.runtime.id)}catch{return!1}}const B=`
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <!-- 身体 - 书本形状 -->
  <g class="buddy-body">
    <!-- 书本外描边 -->
    <rect class="book-outline" x="11" y="19" width="42" height="38" rx="3"/>

    <!-- 书本底色 -->
    <rect class="book-body" x="12" y="20" width="40" height="36" rx="2"/>

    <!-- 书本高光 -->
    <rect class="book-highlight" x="12" y="20" width="6" height="36" rx="2"/>

    <!-- 书页 -->
    <rect class="page-line line-1" x="18" y="22" width="2" height="32" opacity="0.3"/>
    <rect class="page-line line-2" x="22" y="22" width="2" height="32" opacity="0.2"/>
    <rect class="page-line line-3" x="26" y="22" width="2" height="32" opacity="0.15"/>

    <!-- 书本装饰 -->
    <rect class="book-emblem" x="34" y="26" width="10" height="2" rx="1"/>
    <rect class="book-emblem" x="34" y="30" width="8" height="2" rx="1"/>

    <!-- 书签丝带 -->
    <rect class="ribbon" x="30" y="8" width="4" height="20"/>
    <polygon class="ribbon-tip" points="30,28 34,28 32,32"/>
  </g>

  <!-- 眼睛 -->
  <g class="buddy-eyes">
    <circle class="eye-left" cx="26" cy="36" r="3" fill="#2d3748"/>
    <circle class="eye-right" cx="38" cy="36" r="3" fill="#2d3748"/>
    <circle class="eye-shine-left" cx="27" cy="35" r="1" fill="white"/>
    <circle class="eye-shine-right" cx="39" cy="35" r="1" fill="white"/>
  </g>

  <!-- 脸颊 -->
  <g class="buddy-cheeks">
    <circle class="cheek cheek-left" cx="22" cy="41" r="2"/>
    <circle class="cheek cheek-right" cx="42" cy="41" r="2"/>
  </g>

  <!-- 嘴巴 - 根据主题动态设置 -->
  <g class="buddy-mouth-group">
    <!-- classic: Koda 博学者 - 小弧线，温和微笑 -->
    <path class="buddy-mouth mouth-classic" d="M 28 44 Q 32 46.4 36 44"
          stroke="#2d3748" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- cyber: Vex 赛博猎人 - 斜嘴/酷，不对称的自信笑 -->
    <path class="buddy-mouth mouth-cyber" d="M 28 45 Q 31 44 36 42"
          stroke="#fdf2ff" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- grow: Sprout 知识园丁 - 开心微笑弧线 -->
    <path class="buddy-mouth mouth-grow" d="M 28 44 Q 32 48 36 44"
          stroke="#065f46" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- flare: Flare 灵感探险家 - 大一点的开心微笑 -->
    <path class="buddy-mouth mouth-flare" d="M 27 44 Q 32 49 37 44"
          stroke="#78350f" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
    <!-- noir: Null 二进制管家 - 直线，冷静中性 -->
    <path class="buddy-mouth mouth-noir" d="M 28 44 L 36 44"
          stroke="#00ff41" stroke-width="2" fill="none" stroke-linecap="round" style="display:none"/>
  </g>

  <!-- 手臂 -->
  <g class="buddy-arms">
    <rect class="arm-left" x="8" y="32" width="8" height="4" rx="2"/>
    <rect class="arm-right" x="48" y="32" width="8" height="4" rx="2"/>
  </g>

  <!-- 星星装饰 -->
  <g class="buddy-stars">
    <circle class="star" cx="10" cy="16" r="2" opacity="0.8"/>
    <circle class="star" cx="54" cy="16" r="1.5" opacity="0.6"/>
    <circle class="star" cx="14" cy="58" r="1.5" opacity="0.7"/>

    <path class="leaf leaf-1" d="M8 15 C6 16 6 19 9 20 C12 19 12 16 8 15 Z"/>
    <path class="leaf leaf-2" d="M52 15 C50 16 50 19 53 19.8 C56 19 56 16 52 15 Z"/>
    <path class="leaf leaf-3" d="M12 57 C10 58 10 61 13 61.5 C16 61 16 58 12 57 Z"/>
  </g>
</svg>
`,v=`
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }

  @keyframes blink {
    0%, 90%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }

  @keyframes wiggle {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-5deg); }
    75% { transform: rotate(5deg); }
  }

  @keyframes sparkle {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1.2); }
  }

  @keyframes leaf-sway {
    0%, 100% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(6deg) scale(1.05); }
  }

  @keyframes wave-arm-left {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-20deg); }
  }

  @keyframes wave-arm-right {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(20deg); }
  }

  @keyframes neon-pulse {
    0%, 100% { filter: drop-shadow(0 0 5px #8b5cf6) brightness(1); }
    50% { filter: drop-shadow(0 0 15px #ec4899) brightness(1.2); }
  }

  @keyframes soft-breath {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  @keyframes coin-flip {
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  }

  @keyframes scanline {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
  }

  #pixel-buddy-container {
    position: fixed !important;
    width: 64px !important;
    height: 64px !important;
    z-index: 2147483647 !important;
    cursor: grab !important;
    user-select: none !important;
    filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.3)) !important;
    transition: filter 0.3s ease !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    --buddy-body: #3b82f6;
    --buddy-highlight: #2563eb;
    --buddy-ribbon: #f56565;
    --buddy-stars: #fbd38d;
    --buddy-outline: #1e3a8a;
    --buddy-page-line: #ffffff;
    --buddy-emblem: rgba(255, 255, 255, 0.45);
    --buddy-eye: #2d3748;
    --buddy-eye-shine: #ffffff;
    --buddy-mouth: #2d3748;
    --buddy-cheek: #f9a8d4;
    --buddy-leaf: #6ee7b7;
    --buddy-tooltip-bg: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    --buddy-tooltip-border: #0284c7;
  }

  #pixel-buddy-container:hover {
    filter: drop-shadow(0 6px 20px rgba(102, 126, 234, 0.5));
  }

  #pixel-buddy-container.dragging {
    cursor: grabbing;
    filter: drop-shadow(0 8px 24px rgba(102, 126, 234, 0.6));
  }

  #pixel-buddy-container.idle .buddy-body {
    animation: float 3s ease-in-out infinite;
  }

  #pixel-buddy-container.idle .buddy-eyes {
    animation: blink 4s ease-in-out infinite;
    transform-origin: center;
  }

  #pixel-buddy-container.idle .buddy-stars circle {
    animation: sparkle 2s ease-in-out infinite;
  }

  #pixel-buddy-container.idle .buddy-stars circle:nth-child(2) {
    animation-delay: 0.5s;
  }

  #pixel-buddy-container.idle .buddy-stars circle:nth-child(3) {
    animation-delay: 1s;
  }

  #pixel-buddy-container:hover .arm-left {
    animation: wave-arm-left 0.6s ease-in-out 2;
    transform-origin: right center;
  }

  #pixel-buddy-container:hover .arm-right {
    animation: wave-arm-right 0.6s ease-in-out 2;
    transform-origin: left center;
  }

  #pixel-buddy-container:hover {
    animation: wiggle 0.5s ease-in-out 2;
  }

  #pixel-buddy-container .book-outline {
    fill: none;
    stroke: var(--buddy-outline);
    stroke-width: 0.5;
    opacity: 0.3;
  }

  #pixel-buddy-container .book-body {
    fill: var(--buddy-body);
  }

  #pixel-buddy-container .book-highlight {
    fill: var(--buddy-highlight);
  }

  #pixel-buddy-container .page-line {
    fill: var(--buddy-page-line);
  }

  #pixel-buddy-container .book-emblem {
    fill: var(--buddy-emblem);
  }

  #pixel-buddy-container .ribbon,
  #pixel-buddy-container .ribbon-tip {
    fill: var(--buddy-ribbon);
  }

  #pixel-buddy-container .buddy-stars .star {
    fill: var(--buddy-stars);
  }

  #pixel-buddy-container .buddy-stars .leaf {
    fill: var(--buddy-leaf);
    display: none;
    transform-origin: center;
    transform-box: fill-box;
  }

  #pixel-buddy-container .arm-left,
  #pixel-buddy-container .arm-right {
    fill: var(--buddy-body);
  }

  #pixel-buddy-container .buddy-eyes .eye-left,
  #pixel-buddy-container .buddy-eyes .eye-right {
    fill: var(--buddy-eye);
  }

  #pixel-buddy-container .buddy-eyes .eye-shine-left,
  #pixel-buddy-container .buddy-eyes .eye-shine-right {
    fill: var(--buddy-eye-shine);
  }

  #pixel-buddy-container .buddy-mouth {
    stroke: var(--buddy-mouth);
  }

  #pixel-buddy-container .buddy-cheeks .cheek {
    fill: var(--buddy-cheek);
    opacity: 0.35;
  }

  /* 提示气泡 */
  #buddy-tooltip {
    position: absolute;
    bottom: 72px;
    left: 50%;
    transform: translateX(-50%) scale(0);
    background: var(--buddy-tooltip-bg);
    color: white;
    padding: 8px 12px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  #buddy-tooltip .buddy-tooltip-name {
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.2px;
  }

  #buddy-tooltip .buddy-tooltip-slogan {
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.9;
    white-space: normal;
    max-width: 180px;
    line-height: 1.4;
  }

  #buddy-tooltip::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--buddy-tooltip-border);
  }

  #pixel-buddy-container:hover #buddy-tooltip {
    transform: translateX(-50%) scale(1);
    opacity: 1;
  }

  /* 赛博霓虹 */
  #pixel-buddy-container.cyber .buddy-body {
    animation: neon-pulse 2s ease-in-out infinite;
  }

  #pixel-buddy-container.cyber #buddy-tooltip {
    background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
    border: 1px solid #ff79c6;
  }

  /* 森系萌芽 */
  #pixel-buddy-container.grow .buddy-body {
    animation: soft-breath 4s ease-in-out infinite;
    transform-origin: center bottom;
  }

  #pixel-buddy-container.grow .buddy-stars circle {
    display: none;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf {
    display: block;
    animation: leaf-sway 3s ease-in-out infinite;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf-2 {
    animation-delay: 0.4s;
  }

  #pixel-buddy-container.grow .buddy-stars .leaf-3 {
    animation-delay: 0.8s;
  }

  /* 余晖探索 */
  #pixel-buddy-container.flare:active {
    animation: coin-flip 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  #pixel-buddy-container.flare #buddy-tooltip {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  }

  /* 极客终端 */
  #pixel-buddy-container.noir {
    filter: sepia(0) contrast(1.2) !important;
  }

  #pixel-buddy-container.noir .buddy-body {
    animation: scanline 0.1s steps(2) infinite;
  }

  #pixel-buddy-container.noir #buddy-tooltip {
    background: #000;
    color: #00ff41;
    border: 1px solid #00ff41;
    font-family: 'Courier New', monospace;
  }
`,h={classic:{body:"#3b82f6",highlight:"#2563eb",ribbon:"#f56565",stars:"#fbd38d",outline:"#2563eb",pageLine:"#ffffff",emblem:"rgba(255, 255, 255, 0.45)",eye:"#2d3748",eyeShine:"#ffffff",mouth:"#2d3748",cheek:"#f9a8d4",leaf:"#6ee7b7",name:"经典学院 (Blue)",slogan:"井井有条，是知识的优雅。",tooltipBg:"linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",tooltipBorder:"#0284c7"},cyber:{body:"#8b5cf6",highlight:"#7c3aed",ribbon:"#ec4899",stars:"#c4b5fd",outline:"#a78bfa",pageLine:"#f5d0fe",emblem:"rgba(255, 255, 255, 0.5)",eye:"#fdf2ff",eyeShine:"#ffffff",mouth:"#fdf2ff",cheek:"#f472b6",leaf:"#c4b5fd",name:"赛博霓虹 (Cyber)",slogan:"在数字洪流中，捕捉关键信号。",tooltipBg:"linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",tooltipBorder:"#ff79c6"},grow:{body:"#10b981",highlight:"#059669",ribbon:"#34d399",stars:"#6ee7b7",outline:"#34d399",pageLine:"#ecfdf5",emblem:"rgba(255, 255, 255, 0.45)",eye:"#065f46",eyeShine:"#ffffff",mouth:"#065f46",cheek:"#6ee7b7",leaf:"#6ee7b7",name:"森系萌芽 (Grow)",slogan:"收藏只是开始，生长才是目的。",tooltipBg:"linear-gradient(135deg, #10b981 0%, #059669 100%)",tooltipBorder:"#059669"},flare:{body:"#f59e0b",highlight:"#fbbf24",ribbon:"#f97316",stars:"#fde68a",outline:"#fbbf24",pageLine:"#fff7ed",emblem:"rgba(255, 255, 255, 0.5)",eye:"#78350f",eyeShine:"#ffffff",mouth:"#78350f",cheek:"#fdba74",leaf:"#fde68a",name:"余晖探索 (Flare)",slogan:"每一次点击，都是一次新的探险！",tooltipBg:"linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",tooltipBorder:"#d97706"},noir:{body:"#1a1a1a",highlight:"#111111",ribbon:"#00ff41",stars:"#00ff41",outline:"#333333",pageLine:"#00ff41",emblem:"rgba(0, 255, 65, 0.55)",eye:"#00ff41",eyeShine:"#b7ffcd",mouth:"#00ff41",cheek:"#00ff41",leaf:"#00ff41",name:"极客终端 (Noir)",slogan:"拒绝繁杂，回归极简逻辑。",tooltipBg:"#000000",tooltipBorder:"#00ff41"}},g=Object.keys(h);function p(i){return i&&g.includes(i)?i:"classic"}async function m(){var i,t;if(!u())return"classic";try{if((i=chrome==null?void 0:chrome.storage)!=null&&i.local){const o=(t=(await chrome.storage.local.get(["userSettings"])).userSettings)==null?void 0:t.pixelBuddyTheme;return p(o)}}catch(d){console.warn("[Pixel Buddy] Failed to load theme from storage:",d)}return"classic"}function b(i){if(!e)return;g.forEach(y=>e==null?void 0:e.classList.remove(y)),e.classList.add(i);const t=h[i],d=e.querySelector(".buddy-tooltip-name"),o=e.querySelector(".buddy-tooltip-slogan");d&&(d.textContent=t.slogan),o&&(o.textContent=""),e.style.setProperty("--buddy-body",t.body),e.style.setProperty("--buddy-highlight",t.highlight),e.style.setProperty("--buddy-ribbon",t.ribbon),e.style.setProperty("--buddy-stars",t.stars),e.style.setProperty("--buddy-outline",t.outline),e.style.setProperty("--buddy-page-line",t.pageLine),e.style.setProperty("--buddy-emblem",t.emblem),e.style.setProperty("--buddy-eye",t.eye),e.style.setProperty("--buddy-eye-shine",t.eyeShine),e.style.setProperty("--buddy-mouth",t.mouth),e.style.setProperty("--buddy-cheek",t.cheek),e.style.setProperty("--buddy-leaf",t.leaf),e.style.setProperty("--buddy-tooltip-bg",t.tooltipBg),e.style.setProperty("--buddy-tooltip-border",t.tooltipBorder),e.querySelectorAll(".buddy-mouth").forEach(y=>{const f=y;f.classList.contains(`mouth-${i}`)?(f.style.display="block",f.style.stroke=t.mouth):f.style.display="none"})}function P(){var i;!u()||!((i=chrome==null?void 0:chrome.storage)!=null&&i.onChanged)||chrome.storage.onChanged.addListener((t,d)=>{if(!(!u()||d!=="local")){if(t.userSettings){const o=t.userSettings.newValue,n=t.userSettings.oldValue;if((o==null?void 0:o.pixelBuddyTheme)!==(n==null?void 0:n.pixelBuddyTheme)){console.log("[Pixel Buddy] 🔄 Theme changed:",{old:n==null?void 0:n.pixelBuddyTheme,new:o==null?void 0:o.pixelBuddyTheme});const y=p(o==null?void 0:o.pixelBuddyTheme);b(y)}}if(t.pixelBuddyTheme){const o=p(t.pixelBuddyTheme.newValue);b(o)}t.pixelBuddyThemeUpdatedAt&&m().then(o=>b(o))}})}async function x(){if(e){console.log("[Pixel Buddy] Already exists, skipping creation");return}if(console.log("[Pixel Buddy] Creating pixel buddy..."),!document.body){console.error("[Pixel Buddy] document.body does not exist");return}const i=document.createElement("style");i.textContent=v,document.head.appendChild(i),console.log("[Pixel Buddy] Styles injected"),e=document.createElement("div"),e.id="pixel-buddy-container",e.className="idle",e.innerHTML=`
    ${B}
    <div id="buddy-tooltip">
      <div class="buddy-tooltip-name"></div>
      <div class="buddy-tooltip-slogan"></div>
    </div>
  `,e.style.position="fixed",e.style.bottom="80px",e.style.right="20px",e.style.width="64px",e.style.height="64px",e.style.zIndex="2147483647",e.style.display="block",e.style.visibility="visible",e.style.opacity="1";const t=await m();b(t),e.addEventListener("click",M),e.addEventListener("mousedown",C),document.addEventListener("mousemove",T),document.addEventListener("mouseup",k),e.addEventListener("touchstart",L,{passive:!1}),document.addEventListener("touchmove",S,{passive:!1}),document.addEventListener("touchend",Y),window.addEventListener("resize",D),document.body.appendChild(e),P(),E(),console.log("[Pixel Buddy] Added to DOM"),console.log("[Pixel Buddy] Position:",e.getBoundingClientRect()),console.log("[Pixel Buddy] Computed styles:",{display:window.getComputedStyle(e).display,visibility:window.getComputedStyle(e).visibility,opacity:window.getComputedStyle(e).opacity,zIndex:window.getComputedStyle(e).zIndex,position:window.getComputedStyle(e).position}),console.log("[Pixel Buddy] Initialized successfully")}let w=0;function E(){setInterval(function(){e&&u()&&chrome.storage.local.get(["userSettings","pixelBuddyTheme","pixelBuddyThemeUpdatedAt"],function(i){if(!e||!u())return;const t=i.pixelBuddyTheme||i.userSettings&&i.userSettings.pixelBuddyTheme,d=i.pixelBuddyThemeUpdatedAt||0;if(d>w){w=d;const o=p(t);console.log("[Pixel Buddy] Polling detected theme change:",o),b(o)}})},2e3)}async function M(i){var t;if(!a){if(i.stopPropagation(),i.preventDefault(),console.log("[Pixel Buddy] Clicked"),e&&(e.classList.remove("idle"),e.style.animation="wiggle 0.3s ease-in-out",setTimeout(()=>{e&&(e.style.animation="",e.classList.add("idle"))},300)),!u()){console.warn("[Pixel Buddy] Extension context invalidated");return}try{const o=((t=(await chrome.storage.local.get(["userSettings"])).userSettings)==null?void 0:t.openMode)||"sidebar";if(console.log("[Pixel Buddy] Open mode:",o),o==="tab"){console.log("[Pixel Buddy] Opening in new tab (user preference)"),chrome.runtime.sendMessage({type:"OPEN_IN_TAB"},n=>{chrome.runtime.lastError?console.error("[Pixel Buddy] Failed to open in tab:",chrome.runtime.lastError):n!=null&&n.success&&console.log("[Pixel Buddy] Opened in new tab successfully")});return}console.log("[Pixel Buddy] Requesting side panel open..."),chrome.runtime.sendMessage({type:"OPEN_SIDEBAR"},n=>{if(chrome.runtime.lastError){console.error("[Pixel Buddy] Failed to send message:",chrome.runtime.lastError),console.log("[Pixel Buddy] Falling back to new tab..."),chrome.runtime.sendMessage({type:"OPEN_IN_TAB"});return}if(n!=null&&n.success){console.log("[Pixel Buddy] Side panel opened successfully");return}console.log("[Pixel Buddy] Background failed to open side panel:",n==null?void 0:n.error),console.log("[Pixel Buddy] Opening in new tab as fallback..."),chrome.runtime.sendMessage({type:"OPEN_IN_TAB"})})}catch(d){console.error("[Pixel Buddy] Error opening sidebar:",d),chrome.runtime.sendMessage({type:"OPEN_IN_TAB"})}}}function C(i){if(i.button!==0)return;i.preventDefault(),a=!1;const t=e==null?void 0:e.getBoundingClientRect();t&&(r=t.left,l=t.top),s=i.clientX-r,c=i.clientY-l,e&&e.classList.remove("idle")}function T(i){if(s===0&&c===0)return;const t=Math.abs(i.clientX-s-r),d=Math.abs(i.clientY-c-l);if((t>3||d>3)&&(a=!0),!a||!e)return;i.preventDefault(),i.stopPropagation(),r=i.clientX-s,l=i.clientY-c;const o=10,n=window.innerWidth-64-o,y=window.innerHeight-64-o;r=Math.max(o,Math.min(r,n)),l=Math.max(o,Math.min(l,y)),e.style.left=r+"px",e.style.top=l+"px",e.style.right="auto",e.style.bottom="auto",e.classList.add("dragging")}function k(){s=0,c=0,e&&(e.classList.remove("dragging"),setTimeout(()=>{!a&&e&&e.classList.add("idle"),a=!1},100))}function L(i){if(!i.touches.length)return;i.preventDefault(),a=!1;const t=i.touches[0],d=e==null?void 0:e.getBoundingClientRect();d&&(r=d.left,l=d.top),s=t.clientX-r,c=t.clientY-l,e&&e.classList.remove("idle")}function S(i){if(!i.touches.length||s===0&&c===0||!e)return;const t=i.touches[0],d=Math.abs(t.clientX-s-r),o=Math.abs(t.clientY-c-l);if((d>3||o>3)&&(a=!0,i.preventDefault(),i.stopPropagation()),!a)return;r=t.clientX-s,l=t.clientY-c;const n=10,y=window.innerWidth-64-n,f=window.innerHeight-64-n;r=Math.max(n,Math.min(r,y)),l=Math.max(n,Math.min(l,f)),e.style.left=r+"px",e.style.top=l+"px",e.style.right="auto",e.style.bottom="auto",e.classList.add("dragging")}function Y(){k()}function D(){if(!e)return;const i=e.getBoundingClientRect(),t=10,d=window.innerWidth-64-t,o=window.innerHeight-64-t;i.left>d&&(r=d,e.style.left=r+"px"),i.top>o&&(l=o,e.style.top=l+"px")}function X(){if(console.log("[Pixel Buddy] Script loaded"),console.log("[Pixel Buddy] Current page:",window.location.href),console.log("[Pixel Buddy] Document readyState:",document.readyState),window.location.protocol==="chrome:"||window.location.protocol==="chrome-extension:"||window.location.protocol==="about:"){console.log("[Pixel Buddy] Chrome internal page detected, skipping injection");return}document.readyState==="loading"?(console.log("[Pixel Buddy] Waiting for DOM to be ready..."),document.addEventListener("DOMContentLoaded",()=>{console.log("[Pixel Buddy] DOMContentLoaded triggered"),x()})):(console.log("[Pixel Buddy] DOM ready, creating immediately"),x())}X(),console.log("[Pixel Buddy] Initialization complete")})();
