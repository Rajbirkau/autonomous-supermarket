export async function getJson(path) {
  const res = await fetch(path);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new Error(body && body.error ? body.error : 'request failed with status ' + res.status);
  }
  return body;
}

export async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data && data.error ? data.error : 'request failed with status ' + res.status);
  }
  return data;
}
