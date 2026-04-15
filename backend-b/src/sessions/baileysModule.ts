export type BaileysModule = typeof import('@whiskeysockets/baileys')

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<BaileysModule>

export function loadBaileys(): Promise<BaileysModule> {
  return dynamicImport('@whiskeysockets/baileys')
}
