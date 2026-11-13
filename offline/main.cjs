const { app, BrowserWindow, protocol, net, session, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ORIGIN = 'mccv://app';
protocol.registerSchemesAsPrivileged([{ scheme: 'mccv', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true,
} }]);
app.setName('mCalcCanvas Desktop');
app.setPath('userData', process.env.MCCV_DESKTOP_TEST_DATA || path.join(app.getPath('appData'), 'mCalcCanvas Desktop'));

function createWindow() {
  const window = new BrowserWindow({
    title: 'mCalcCanvas Desktop', width: 1440, height: 960, minWidth: 900, minHeight: 640,
    show: false, backgroundColor: '#f8fafc',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(`${ORIGIN}/`);
}

app.whenReady().then(() => {
  const root = path.join(__dirname, 'app');
  protocol.handle('mccv', async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || !['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 403 });
      const file = path.resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
      const relative = path.relative(root, file);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response(null, { status: 403 });
      const response = await net.fetch(pathToFileURL(file).href);
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'");
      return response;
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Application', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' },
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
