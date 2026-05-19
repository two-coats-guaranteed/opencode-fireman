import { db } from "./db";

export function findDevice(deviceId: string): Device | null {
  return db.devices.get(deviceId) ?? null;
}
