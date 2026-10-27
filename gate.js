import { decryptPackage } from './crypto.js';
const form = document.querySelector('#unlock-form');
const input = document.querySelector('#password');
const button = document.querySelector('#unlock-button');
const status = document.querySelector('#status');
const iframe = document.querySelector('#game');
const scope = new URL('./', location.href);
const workerUrl = new URL('sw.js', scope).href;
let unlocked = null;
let busy = false;
function workerRequest(worker, message) {
  return new Promise((resolve,reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => reject(new Error('Browser session setup timed out. Reload and try again.')), 10000);
    channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); event.data.ok ? resolve() : reject(new Error('Session could not be opened.')); };
    worker.postMessage(message, [channel.port2]);
  });
}
// Browsers may stop an idle worker. Restore only this tab's live session
// from memory; no password, key or decrypted asset is written to storage.
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.source?.scriptURL !== workerUrl || !unlocked) return;
  if (event.data?.type === 'restore' && event.data.token === unlocked.token)
    event.source.postMessage({type:'open', ...unlocked});
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  busy = true; button.disabled = true; status.textContent = 'Downloading and unlocking…';
  try {
    if (!isSecureContext || !navigator.serviceWorker || !crypto.subtle)
      throw new Error('Use HTTPS (or localhost) in a browser with service workers enabled.');
    const response = await fetch(new URL('game.enc', scope), {cache:'no-store'});
    if (!response.ok) throw new Error('The encrypted build could not be downloaded.');
    let plaintext;
    try { plaintext = await decryptPackage(new Uint8Array(await response.arrayBuffer()), input.value); }
    catch { throw new Error('Incorrect password or damaged build. Try again.'); }
    input.value = '';
    const packageData = JSON.parse(new TextDecoder().decode(plaintext));
    if (packageData.version !== 1 || !packageData.files?.['index.html']) throw new Error('Unsupported game archive.');
    const token = crypto.randomUUID();
    unlocked = {token, files: packageData.files};
    const registration = await navigator.serviceWorker.register(workerUrl, {scope:scope.pathname});
    await navigator.serviceWorker.ready;
    await workerRequest(registration.active, {type:'open', ...unlocked});
    iframe.src = new URL('play/' + token + '/index.html', scope).href;
    document.querySelector('#gate').hidden = true;
    document.querySelector('#play').hidden = false;
    status.textContent = 'Unlocked.';
  } catch (error) {
    unlocked = null;
    status.textContent = error.message || 'Could not unlock this build.';
  } finally { busy = false; button.disabled = false; }
});
document.querySelector('#lock-button').addEventListener('click', async () => {
  const token = unlocked?.token;
  unlocked = null;
  iframe.removeAttribute('src');
  document.querySelector('#play').hidden = true;
  document.querySelector('#gate').hidden = false;
  const registration = await navigator.serviceWorker.getRegistration(scope);
  if (registration?.active && token) await workerRequest(registration.active, {type:'lock',token});
  status.textContent = 'Locked. Enter the password to play again.';
  input.focus();
});

// Enable submission only after the module has installed the submit handler.
button.disabled = false;
