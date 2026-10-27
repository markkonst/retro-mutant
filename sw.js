// Virtual filesystem for an already unlocked tab. No game bytes are shipped here.
// Deliberately no Cache API, IndexedDB or network fallback for virtual files.
const sessions = new Map();
const restoring = new Map();
const prefix = new URL('play/', self.registration.scope).pathname;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const data = event.data;
  // Only the gate document may install/drop sessions, never an embedded game.
  if (!event.source?.url || new URL(event.source.url).pathname !== new URL(self.registration.scope).pathname &&
      new URL(event.source.url).pathname !== new URL('index.html', self.registration.scope).pathname) return;
  if (data?.type === 'open' && typeof data.token === 'string' && data.files?.['index.html']) {
    sessions.set(data.token, data.files);
    restoring.get(data.token)?.resolve(data.files);
    restoring.delete(data.token);
    event.ports[0]?.postMessage({ok:true});
  }
  if (data?.type === 'lock') {
    sessions.delete(data.token);
    event.ports[0]?.postMessage({ok:true});
  }
});
async function recover(token) {
  if (sessions.has(token)) return sessions.get(token);
  if (restoring.has(token)) return restoring.get(token).promise;
  let finish;
  const files = new Promise(resolve => { finish = resolve; });
  const pending = {promise:files, resolve:finish};
  restoring.set(token, pending);
  setTimeout(() => { if (restoring.get(token) === pending) restoring.delete(token); finish(null); }, 2500);
  for (const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))
    client.postMessage({type:'restore',token});
  return files;
}
const types = {html:'text/html; charset=utf-8',js:'text/javascript',mjs:'text/javascript',css:'text/css',json:'application/json',png:'image/png',bin:'application/octet-stream',svg:'image/svg+xml'};
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(prefix)) return;
  event.respondWith((async () => {
    const relative = url.pathname.slice(prefix.length);
    const slash = relative.indexOf('/');
    const token = relative.slice(0,slash);
    const name = decodeURIComponent(relative.slice(slash + 1));
    const files = sessions.get(token) || await recover(token);
    const headers = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
    if (!files) return new Response('Locked. Return to the password page.', {status:401,headers});
    if (!Object.hasOwn(files,name)) return new Response('Not found', {status:404,headers});
    if (!['GET','HEAD'].includes(event.request.method)) return new Response('Method not allowed',{status:405,headers});
    const bytes = Uint8Array.from(atob(files[name]), c => c.charCodeAt(0));
    headers['Content-Type'] = types[name.split('.').pop()] || 'application/octet-stream';
    return new Response(event.request.method === 'HEAD' ? null : bytes, {headers});
  })());
});
