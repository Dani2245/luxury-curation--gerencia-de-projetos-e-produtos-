import fs from 'node:fs';
import path from 'node:path';
import { API_URL, SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { loginApi } from './api.js';
export const PHOTO = path.resolve('public/seed/silver-watch.jpg');
export const multipartAs = async (user, endpoint, fields, { method = 'POST', photos = false } = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([k,v]) => form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
  if (photos) form.append('fotografias', new Blob([fs.readFileSync(PHOTO)], { type: 'image/jpeg' }), 'pericia.jpg');
  const response = await fetch(`${API_URL}/api${endpoint}`, { method, headers: { Authorization: `Bearer ${await loginApi(user.email)}` }, body: form });
  return { status: response.status, data: await response.json().catch(() => null) };
};
export const rpcAs = async (user, name, body) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await loginApi(user.email)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json().catch(() => null) };
};
export const removeStorage = async (user, bucket, paths) => {
  if (!paths.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${await loginApi(user.email)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
};
