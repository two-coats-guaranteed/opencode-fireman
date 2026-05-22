import { fetchUserRecord } from "../users/user-v2";

export function getUserId(rec: UserRecord): string {
  return rec.id;
}
