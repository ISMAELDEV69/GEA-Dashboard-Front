import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Filter, Search, Check } from 'lucide-react';

export default function ColumnFilter({ columnKey, label, data, currentSelection, onApply }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempSelection, setTempSelection] = useState([]);
  const containerRef = useRef(null);

  // Get occurrence counts for each value in this column
  const valueCounts = useMemo(() => {
    const counts = new Map();
    (data || []).forEach(row => {
      let rowVal = '';
      if (columnKey === 'candidato') {
        rowVal = `${row.apellido_paterno || ''} ${row.nombres || ''} ${row.documento || ''}`.trim();
      } else {
        rowVal = String(row[columnKey] || '').trim();
      }
      counts.set(rowVal, (counts.get(rowVal) || 0) + 1);
    });
    return counts;
  }, [data, columnKey]);

  // Get unique non-empty values for this column from the dataset
  const uniqueValues = useMemo(() => {
    return Array.from(valueCounts.keys()).sort((a, b) => {
      // Sort by count descending then alphabetically
      const countDiff = (valueCounts.get(b) || 0) - (valueCounts.get(a) || 0);
      if (countDiff !== 0) return countDiff;
      return a.localeCompare(b);
    });
  }, [valueCounts]);

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

  // Determine total candidates in selected filters
  const totalSelectedCount = useMemo(() => {
    return tempSelection.reduce((acc, v) => acc + (valueCounts.get(v) || 0), 0);
  }, [tempSelection, valueCounts]);

  // Determine icon styling if filter is active
  const isActive = currentSelection && currentSelection.length > 0;

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`p-1 rounded-sm transition-colors relative flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-400'}`}
        title={`Filtrar por ${label}${isActive ? ` (${currentSelection.length} activo)` : ''}`}
      >
        <Filter size={14} />
        {isActive && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 bg-indigo-600 text-white rounded-full text-[8px] font-black flex items-center justify-center shadow-xs">
            {currentSelection.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          className="absolute left-0 top-full mt-1 z-50 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl flex flex-col font-sans normal-case animate-in fade-in zoom-in-95 duration-100"
          onClick={e => e.stopPropagation()}
        >
          {/* Header & Search */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                Filtrar por {label}
              </h4>
              <span className="text-[10px] font-bold text-slate-400">
                {uniqueValues.length} {uniqueValues.length === 1 ? 'opción' : 'opciones'}
              </span>
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar opción..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                autoFocus
              />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-700 text-xs font-medium bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex gap-3 text-indigo-600 dark:text-indigo-400">
              <button type="button" onClick={handleSelectAll} className="hover:underline cursor-pointer font-bold">
                Todos
              </button>
              <button type="button" onClick={handleClear} className="hover:underline text-slate-500 dark:text-slate-400 cursor-pointer">
                Borrar
              </button>
            </div>
            {tempSelection.length > 0 && (
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                {totalSelectedCount} postulantes ({tempSelection.length} {tempSelection.length === 1 ? 'sel.' : 'sels.'})
              </span>
            )}
          </div>

          {/* Checkbox List */}
          <div className="max-h-52 overflow-y-auto p-1.5 flex-1">
            {filteredValues.length === 0 ? (
              <div className="p-4 text-xs text-center text-slate-400">Sin coincidencias</div>
            ) : (
              <ul className="space-y-1">
                {filteredValues.map((val, idx) => {
                  const isChecked = tempSelection.includes(val);
                  const count = valueCounts.get(val) || 0;
                  return (
                    <li key={idx}>
                      <div 
                        onClick={() => toggleValue(val)}
                        className="flex items-center justify-between gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg cursor-pointer transition-colors select-none group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-slate-400'}`}>
                            {isChecked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className="text-xs text-slate-700 dark:text-slate-300 break-all leading-tight truncate">
                            {val === '' ? <em className="text-slate-400">(Vacías / Sin asignar)</em> : val}
                          </span>
                        </div>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 transition-colors ${
                          isChecked 
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-black' 
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                        }`}>
                          {count}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-2.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/80 rounded-b-xl">
            <span className="text-[10px] text-slate-400 font-medium">
              {tempSelection.length > 0 ? `${totalSelectedCount} de ${data.length}` : 'Todos'}
            </span>
            <div className="flex gap-1.5">
              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleApply}
                className="px-3.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-all cursor-pointer flex items-center gap-1"
              >
                <Check size={13} /> Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
