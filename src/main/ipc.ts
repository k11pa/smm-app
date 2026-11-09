import { ipcMain } from 'electron'
import type { z } from 'zod'

// Input crosses a process boundary, so it is validated here even though our own UI sent it.
export function handle<S extends z.ZodType>(channel: string, schema: S, fn: (input: z.infer<S>) => unknown) {
  ipcMain.handle(channel, async (_e, raw) => {
    const input = schema.safeParse(raw)
    if (!input.success) return { ok: false, error: 'INVALID_INPUT' }
    try {
      return await fn(input.data)
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}
