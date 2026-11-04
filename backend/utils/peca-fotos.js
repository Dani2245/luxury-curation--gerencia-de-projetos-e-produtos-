const PREFIX = 'privado:';
const BUCKET = 'pecas-privadas';
const resolveFotos = async (db, refs = []) => Promise.all(refs.map(async (ref) => {
  if (!ref?.startsWith(PREFIX)) return ref;
  const { data } = await db.storage.from(BUCKET).createSignedUrl(ref.slice(PREFIX.length), 300);
  return data?.signedUrl || null;
}));
module.exports = { PREFIX, BUCKET, resolveFotos };
