export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function makeApi(token) {
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) throw new Error(data.error ?? res.statusText);
    return data;
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    del: (p) => call('DELETE', p),
  };
}
