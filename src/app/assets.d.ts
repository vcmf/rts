// Vite's asset imports: `?url` gives the built file's URL
declare module '*?url' {
  const url: string
  export default url
}
