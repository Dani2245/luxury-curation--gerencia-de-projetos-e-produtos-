import { useEffect, useState } from 'react';
import { apiFetch } from './api';

export const useCategories = () => {
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    apiFetch('/categorias').then((data) => { if (active) setCategories(data); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  return { categories, error };
};
