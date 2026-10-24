import { BridgeError } from '../src/protocol.js';

async function message(type, values = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...values });
  if (!response?.ok) throw new BridgeError(response?.error?.code || 'EIO', response?.error?.message || '扩展没有返回结果。', response?.error?.details);
  return response.result;
}

export const call = (operation, args = {}) => message('anymark.operation', { operation, args });
export const getStatus = () => message('anymark.status');
export const openWeb = () => call('web');
export const setEnabled = enabled => message('anymark.enable', { enabled });
export const reconnect = () => message('anymark.reconnect');

export async function currentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const title = tab?.title || url;
  if (!url) return { title, url, supported: false, reasonKey: 'popup.noTabReason', reason: '无法读取当前网页。请从普通网页的工具栏打开 AnyMark。' };
  let parsed;
  try { parsed = new URL(url); } catch { return { title, url, supported: false, reasonKey: 'popup.noUrlReason', reason: '当前页面没有可保存的网址。' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { title, url, supported: false, reasonKey: 'popup.unsupportedReason', reason: '此页面不支持加入 Inbox，请切换到普通网页。' };
  return { title, url: parsed.href, supported: true };
}
