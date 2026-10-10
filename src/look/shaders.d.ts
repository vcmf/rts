// Vite's raw imports: `?raw` gives the file's text (the shaders in src/look/shaders/)
declare module '*?raw' { const text: string; export default text }
