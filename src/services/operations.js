export const inputClass = 'w-full bg-[#111] border border-gray-700 rounded-sm px-3 py-2 text-gray-200 focus:outline-none focus:border-[#A69076] font-sans';
export const labelClass = 'block text-gray-400 font-sans text-xs uppercase tracking-widest mb-2';
export const buttonClass = 'border border-[#A69076] text-[#D3BE96] px-4 py-2 text-xs uppercase tracking-widest hover:bg-[#A69076] hover:text-black disabled:opacity-50 disabled:cursor-wait transition-colors';
export const primaryClass = 'bg-[#A69076] text-black px-4 py-2 text-xs uppercase tracking-widest font-medium hover:bg-[#C5AD83] disabled:opacity-50 disabled:cursor-wait transition-colors';
export const today = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
};
export const displayDate = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
