export async function emitTrace(record) {
  db.traces.insert(record);
  return record.id;
}
