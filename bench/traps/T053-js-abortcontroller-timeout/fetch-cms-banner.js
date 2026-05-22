export async function fetchCmsBanner(url) {
  const res = await fetch(url, { method: "GET" });
  return await res.json();
}
