import React, { useEffect, useState } from 'react';
import { apiFetch } from '../services/api';
import PublicPassport from '../pages/PublicPassport';
export default function PassportExample() {
  const [example, setExample] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { apiFetch('/publico/exemplo').then(setExample).catch((e) => setError(e.message)); }, []);
  if (!example) return <div className="max-w-3xl mx-auto pt-32 px-6"><h1 className="text-3xl font-serif mb-4">Passaporte-exemplo</h1><p role={error ? 'alert' : 'status'}>{error || 'Carregando...'}</p></div>;
  return <PublicPassport exampleToken={example.token} example={example} />;
}
