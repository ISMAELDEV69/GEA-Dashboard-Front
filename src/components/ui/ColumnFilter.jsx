import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Filter, Search, Check } from 'lucide-react';

export default function ColumnFilter({ columnKey, label, data, currentSelection, onApply }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempSelection, setTempSelection] = useState([]);
  const containerRef = useRef(null);

  // Get unique non-empty values for this column from the dataset
  const uniqueValues = useMemo(() => {
    if (columnKey === 'candidato') {
      const vals = data.map(row => `${row.apellido_paterno || ''} ${row.nombres || ''} ${row.documento || ''}`.trim());
      return [...new Set(vals)].filter(Boolean).sort();
    }
    const vals = data.map(row => String(row[columnKey] || '').trim());
    return [...new Set(vals)].filter(Boolean).sort();
  }, [data, columnKey]);

  // Filter unique values based on internal search input
  const filteredValues = useMemo(() => {
    if (!search) return uniqueValues;
    const lowerSearch = search.toLowerCase();
    return uniqueValues.filter(val => val.toLowerCase().includes(lowerSearch));
  }, [uniqueValues, search]);

  // Reset temp selection when popover opens
  useEffect(() => {
    if (isOpen) {
      setTempSelection(currentSelection || []);
      setSearch('');
    }
  }, [isOpen, currentSelection]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const toggleValue = (val) => {
    setTempSelection(prev => 
      prev.includes(val) ? prev.filter(item => item !== val) : [...prev, val]
    );
  };

  const handleSelectAll = () => {
    // If all filtered are selected, unselect them. Otherwise select all filtered.
    const allFilteredSelected = filteredValues.every(val => tempSelection.includes(val));
    if (allFilteredSelected) {
      setTempSelection(prev => prev.filter(item => !filteredValues.includes(item)));
    } else {
      const newSelection = new Set([...tempSelection, ...filteredValues]);
      setTempSelection(Array.from(newSelection));
    }
  };

  const handleClear = () => {
    setTempSelection([]);
  };

  const handleApply = () => {
    onApply(tempSelection);
    setIsOpen(false);
  };

  // Determine icon styling if filter is active
  const isActive = currentSelection && currentSelection.length > 0;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`p-1 rounded-sm transition-colors flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-400'}`}
        title="Filtrar columna"
      >
        <Filter size={14} />
      </button>

      {isOpen && (
        <div 
          className="absolute left-0 top-full mt-1 z-50 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl flex flex-col font-sans normal-case"
          onClick={e => e.stopPropagation()}
        >
          {/* Header & Search */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2 truncate">Filtrar por {label}</h4>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex px-3 py-2 gap-3 border-b border-slate-100 dark:border-slate-700 text-xs font-medium text-indigo-600 dark:text-indigo-400">
            <button onClick={handleSelectAll} className="hover:underline">Seleccionar todo</button>
            <button onClick={handleClear} className="hover:underline text-slate-500 dark:text-slate-400">Borrar</button>
          </div>

          {/* Checkbox List */}
          <div className="max-h-48 overflow-y-auto p-1 flex-1">
            {filteredValues.length === 0 ? (
              <div className="p-3 text-xs text-center text-slate-400">Sin resultados</div>
            ) : (
              <ul className="space-y-0.5">
                {filteredValues.map((val, idx) => {
                  const isChecked = tempSelection.includes(val);
                  return (
                    <li key={idx}>
                      <div 
                        onClick={() => toggleValue(val)}
                        className="flex items-start gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded cursor-pointer transition-colors select-none"
                      >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'}`}>
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className="text-xs text-slate-700 dark:text-slate-300 break-all leading-tight pt-0.5">{val === '' ? '(Vacías)' : val}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/80 rounded-b-lg">
            <button 
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded border border-transparent"
            >
              Cancelar
            </button>
            <button 
              onClick={handleApply}
              className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm transition-colors"
            >
              Aceptar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
