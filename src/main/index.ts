import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { chat } from './ai'
import { getSettings, setKey, updateSettings } from './store'

// Only web links may leave the app: file:, ms-*: and similar schemes can launch local programs.
function isWebUrl(url: string) {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'SMM App',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, sandbox: false }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('settings:get', () => getSettings())
ipcMain.handle('settings:update', (_e, patch) => updateSettings(patch))
ipcMain.handle('settings:setKey', (_e, provider, key) => setKey(provider, key))
ipcMain.handle('ai:chat', (_e, prompt: string, system?: string) => chat(prompt, system))
ipcMain.handle('ai:test', (_e, provider, model) => chat('Reply with the single word: OK', '', { provider, model }))

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
