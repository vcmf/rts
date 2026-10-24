// Vite's raw imports: `?raw` gives the file's text (the shaders in src/look/shaders/)
declare module '*?raw' {
  const text: string
  export default text
}
// Vite's glob imports, eager: each matching file's export by its path (the figures' unit data by file:
// src/look/main.ts)
interface ImportMeta {
  glob<T>(pattern: string, options: { query?: string; import?: string; eager: true }): Record<string, T>
}
