export async function emitMetric(record) {
  db.metrics.insert(record);
  return record.id;
}
