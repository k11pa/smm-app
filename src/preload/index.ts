import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
  setKey: (provider: string, key: string | null) => ipcRenderer.invoke('settings:setKey', provider, key),
  chat: (prompt: string, system?: string) => ipcRenderer.invoke('ai:chat', prompt, system),
  testAi: (provider: string, model: string) => ipcRenderer.invoke('ai:test', provider, model),
  brand: {
    getCurrent: () => ipcRenderer.invoke('brand:getCurrent'),
    fetchSite: (url: string) => ipcRenderer.invoke('brand:fetchSite', url),
    suggestAnswers: (input: unknown) => ipcRenderer.invoke('brand:suggestAnswers', input),
    generate: (input: unknown) => ipcRenderer.invoke('brand:generate', input),
    regenerateSection: (input: unknown) => ipcRenderer.invoke('brand:regenerateSection', input),
    save: (input: unknown) => ipcRenderer.invoke('brand:save', input)
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
