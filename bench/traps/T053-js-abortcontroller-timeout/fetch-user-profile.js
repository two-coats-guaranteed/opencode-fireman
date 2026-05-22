export async function fetchUserProfile(url) {
  const res = await fetch(url, { method: "GET" });
  return await res.json();
}
