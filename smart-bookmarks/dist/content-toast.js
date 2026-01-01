chrome.runtime.onMessage.addListener(o=>{o.type==="SHOW_TOAST"&&i(o.data)});function i(o){const{message:n,type:s="success",duration:m=3e3}=o,t=document.createElement("div");t.className=`smart-bookmarks-toast smart-bookmarks-toast-${s}`;const e=document.createElement("span");e.className="smart-bookmarks-toast-icon",e.textContent=s==="success"?"✅":s==="error"?"❌":"ℹ️";const a=document.createElement("span");a.className="smart-bookmarks-toast-text",a.textContent=n,t.appendChild(e),t.appendChild(a),document.body.appendChild(t),setTimeout(()=>{t.classList.add("smart-bookmarks-toast-show")},10),setTimeout(()=>{t.classList.remove("smart-bookmarks-toast-show"),setTimeout(()=>{document.body.removeChild(t)},300)},m)}const r=document.createElement("style");r.textContent=`
  .smart-bookmarks-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: #333;
    opacity: 0;
    transform: translateX(100px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  }

  .smart-bookmarks-toast-show {
    opacity: 1;
    transform: translateX(0);
  }

  .smart-bookmarks-toast-success {
    border-left: 4px solid #10b981;
  }

  .smart-bookmarks-toast-error {
    border-left: 4px solid #ef4444;
  }

  .smart-bookmarks-toast-info {
    border-left: 4px solid #3b82f6;
  }

  .smart-bookmarks-toast-icon {
    font-size: 20px;
    line-height: 1;
  }

  .smart-bookmarks-toast-text {
    line-height: 1.4;
    max-width: 300px;
  }
`;document.head.appendChild(r);
