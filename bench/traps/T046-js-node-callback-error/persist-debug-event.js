export function persistDebugEvent(event, cb) {
  fs.writeFile(eventPath(event.id), JSON.stringify(event), () => {
    cb(null, event.id);
  });
}
