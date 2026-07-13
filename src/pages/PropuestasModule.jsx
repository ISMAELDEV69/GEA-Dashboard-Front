import { useState } from 'react';
import PropuestaForm from '../components/PropuestaForm';
import PropuestasConsolidado from '../components/PropuestasConsolidado';
import { FileSpreadsheet, List } from 'lucide-react';

export default function PropuestasModule() {
  const [activeTab, setActiveTab] = useState('form'); // 'form' | 'consolidado'

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="text-blue-500" /> Propuestas de Campaña
          </h1>
          <p className="text-slate-400 text-sm mt-1">Generador de propuestas y consolidado automático de pagos.</p>
        </div>
        
        <div className="flex bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('form')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'form' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <FileSpreadsheet size={16} /> Crear Propuesta
          </button>
          <button
            onClick={() => setActiveTab('consolidado')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'consolidado' 
                ? 'bg-blue-600 text-white shadow-sm' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <List size={16} /> Ver Consolidado
          </button>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === 'form' ? (
          <PropuestaForm onSaved={() => setActiveTab('consolidado')} />
        ) : (
          <PropuestasConsolidado />
        )}
      </div>
    </div>
  );
}
