import React from 'react';
import { FileText, Upload, X } from 'lucide-react';

// Seleção de arquivos de um tipo de documento do passaporte (PDF, JPG, PNG ou WebP, até 10 MB)
const DocumentUpload = ({ id, label, files, onChange, required = false, multiple = true }) => {
  const handleFiles = (e) => {
    const selecionados = Array.from(e.target.files);
    onChange(multiple ? [...files, ...selecionados] : selecionados.slice(0, 1));
    e.target.value = '';
  };

  return (
    <div>
      <span className="block text-gray-400 font-sans text-xs tracking-widest uppercase mb-2">
        {label}{required && ' *'}
      </span>

      {files.length > 0 && (
        <ul className="mb-3 space-y-2">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 bg-[#0a0a0a] border border-gray-800 px-3 py-2 font-sans text-sm text-gray-300">
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-[#A69076] flex-shrink-0" />
                <span className="truncate">{file.name}</span>
              </span>
              <button
                type="button"
                aria-label={`Remover ${file.name}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="text-gray-500 hover:text-red-400"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label htmlFor={id} className="inline-flex items-center gap-2 bg-gray-800 px-5 py-2.5 cursor-pointer hover:bg-gray-700 transition-colors font-sans text-sm text-gray-300">
        <Upload className="w-4 h-4 text-gray-400" /> Adicionar arquivo
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={handleFiles}
        className="sr-only"
      />
    </div>
  );
};

export default DocumentUpload;
