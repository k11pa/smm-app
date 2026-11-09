import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
  setKey: (provider: string, key: string | null) => ipcRenderer.invoke('settings:setKey', provider, key),
  chat: (prompt: string, system?: string) => ipcRenderer.invoke('ai:chat', prompt, system),
  testAi: (provider: string, model: string) => ipcRenderer.invoke('ai:test', provider, model)
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
