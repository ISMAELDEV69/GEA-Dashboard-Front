import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, AlertCircle, Link, RefreshCw } from 'lucide-react';
import { fetchDashboardsLinks } from '../lib/dataService';

export default function LegacyDashboards({ currentRole }) {
  const [links, setLinks] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDashboardsLinks();
      // Filtrar solo los links a los que este rol tiene acceso
      const allowed = data.filter(d => (d.roles || []).includes(currentRole));
      setLinks(allowed);
      if (allowed.length > 0) {
        setActiveTab(allowed[0].id);
      }
    } catch (err) {
      console.error("Error al cargar dashboards", err);
      setError(err?.message || "Error al cargar enlaces de dashboards");
    } finally {
      setLoading(false);
    }
  }, [currentRole]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const currentDashboard = links.find(d => d.id === activeTab);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-[var(--text-muted)] animate-pulse">Cargando Dashboards...</div>;
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-rose-400 bg-rose-500/10 rounded-2xl border border-rose-500/20 p-8 max-w-md mx-auto my-12">
        <AlertCircle size={40} className="mb-3 text-rose-400" />
        <p className="text-base font-semibold text-rose-400">Error al cargar Dashboards</p>
        <p className="text-xs mt-1 text-center text-rose-400/80 mb-4">{error}</p>
        <button
          onClick={loadLinks}
          className="btn-primary inline-flex items-center gap-2 text-xs py-2 px-4"
        >
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200">
        <AlertCircle size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium text-gray-600">No hay Dashboards disponibles</p>
        <p className="text-sm mt-1 max-w-md text-center">
          No tienes permisos para ver ningún Dashboard o aún no han sido configurados por el Administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
      {/* HEADER TABS */}
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" />
            Dashboards
          </h2>
        </div>
        
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1">
          {links.map((dash) => {
            const isActive = activeTab === dash.id;
            return (
              <button
                key={dash.id}
                onClick={() => setActiveTab(dash.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap
                  ${isActive 
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200 shadow-sm' 
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
              >
                <Link size={14} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                {dash.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* IFRAME CONTAINER */}
      <div className="flex-1 bg-gray-100 relative">
        {currentDashboard && (
          <iframe
            title={currentDashboard.nombre}
            src={currentDashboard.url}
            className="absolute inset-0 w-full h-full border-none"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
