// every typed-array column of a table, in name order: a column added to a table is saved, hashed and
// cleared on reaping with no list to update
export type Column = Uint8Array | Int8Array | Uint16Array | Int32Array | Uint32Array | Float64Array
export const columnsOf = (t: object): Column[] =>
  Object.keys(t)
    .sort()
    .map(k => (t as Record<string, Column>)[k])
