export const fmt = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
export const fmtMin = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
export const fmtSz = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? (b / 1e3).toFixed(0) + ' KB' : b + ' B'
export const fmtTime = s => s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s > 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
export const now8 = () => new Date().toTimeString().slice(0, 8)
export const escH = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const makeId = n => '#' + Math.abs([...n].reduce((a, c, i) => ((a << 5) - a + c.charCodeAt(0) * (i + 7)) | 0, 0)).toString(16).padStart(8, '0').toUpperCase()
export const WORDS = ['apple', 'bridge', 'cedar', 'delta', 'ember', 'flint', 'grove', 'harbor', 'iris', 'jade', 'kite', 'lemon', 'maple', 'noble', 'orbit', 'quartz', 'river', 'stone', 'tiger', 'vault', 'walnut', 'xenon', 'zinc']
export const phrase = () => { const w = () => WORDS[Math.floor(Math.random() * WORDS.length)]; return `${w()}-${w()}-${w()}-${w()}` }

export const IS_ARCH = /\.(zip|tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz)$/i
export const IS_ZIP = /\.zip$/i
export const IS_ARCH_VIEWABLE = /\.(zip|tar|tgz|tar\.gz|tar\.bz2|tar\.xz)$/i  // archives we can list/browse
export const IS_UNSUPPORTED_ARCH = /\.(rar|7z|iso|dmg|apk|cab|pkg|deb|rpm|z|lz|lzma|lzo)$/i  // v4: Block unsupported archives
export const IS_BARE_COMPRESSED = /(?<!\.tar)\.(bz2|gz|xz)$/i
// all git-tracked text / code types
export const IS_TEXT = /\.(txt|md|markdown|rst|log|json|jsonc|json5|xml|csv|tsv|html|htm|css|scss|less|sass|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|pyw|java|c|cpp|cc|cxx|h|hpp|sh|bash|zsh|fish|yaml|yml|toml|ini|cfg|conf|env|envrc|sql|rs|go|rb|rake|php|bat|ps1|psm1|psd1|lua|r|m|jl|hs|elm|ex|exs|erl|clj|cljs|cljc|zig|v|tf|tfvars|proto|graphql|gql|prisma|gradle|mk|makefile|cmake|dockerfile|containerfile|gitignore|gitattributes|npmrc|eslintrc|prettierrc|babelrc|editorconfig|lock|mod|sum|gradle|properties|plist|inf)$/i
export const IS_IMG = /\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff|avif)$/i
export const IS_PDF = /\.pdf$/i
// viewable inline: all text + image + pdf
export const IS_VIEWABLE = /\.(txt|md|markdown|rst|log|json|jsonc|xml|csv|html|htm|css|scss|less|js|mjs|jsx|ts|tsx|vue|svelte|py|java|c|cpp|h|hpp|sh|bash|yaml|yml|toml|ini|cfg|conf|env|sql|rs|go|rb|php|bat|ps1|lua|r|m|ex|exs|zig|tf|proto|graphql|prisma|gitignore|dockerfile|properties|lock|mod|vue|svelte|png|jpg|jpeg|gif|bmp|webp|svg|ico|pdf)$/i
// dangerous executables — warn sender, warn receiver
export const IS_DANGEROUS = /\.(exe|dll|msi|vbs|vbe|wsf|wsh|scr|hta|jar|com|reg|lnk|iso|dmg|pkg|deb|rpm|apk|pif|cmd)$/i

// ── HELPER ───────────────────────────────────────────────────────────────────
export function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = () => rej(new Error('FileReader failed'))
    r.readAsDataURL(file)
  })
}
