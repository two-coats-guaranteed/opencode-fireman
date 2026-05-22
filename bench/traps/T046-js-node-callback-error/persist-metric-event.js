export function persistMetricEvent(event, cb) {
  fs.writeFile(eventPath(event.id), JSON.stringify(event), () => {
    cb(null, event.id);
  });
}
