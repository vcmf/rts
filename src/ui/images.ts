// The History thumbnails (data/history/<nation>/<id>.jpg), bundled by Vite; looked up by their roster path.
const THUMBS = import.meta.glob<string>('../../data/history/**/*.jpg', {
  query: '?url',
  import: 'default',
  eager: true,
})
const PREFIX = '../../data/history/'

/** The built URL of the thumbnail at `path` under data/history/; throws for one the build does not hold. */
export function historyImage(path: string): string {
  const url = THUMBS[PREFIX + path]
  if (!url) throw new Error(`front menu: no thumbnail data/history/${path}`)
  return url
}
