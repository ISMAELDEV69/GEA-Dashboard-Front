import React, { useState, useEffect } from 'react';
import { BarChart3, Plus, Trash2, Edit2, Save, X, Link, AlertTriangle } from 'lucide-react';
import { fetchDashboardsLinks, saveDashboardLink, deleteDashboardLink, fetchAppRoles } from '../lib/dataService';
import PageLayout from './ui/PageLayout';
import PageHeader from './ui/PageHeader';
import Card from './ui/Card';

export default function DashboardsAdmin() {
  const [links, setLinks] = useState([]);
  const [appRoles, setAppRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [currentLink, setCurrentLink] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const [data, rolesData] = await Promise.all([
        fetchDashboardsLinks(),
        fetchAppRoles()
      ]);
      setLinks(data || []);
      setAppRoles(rolesData || []);
    } catch (err) {
      console.error(err);
      setErrorMsg("Error al cargar los enlaces. Asegúrate de haber creado la tabla en Supabase.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleAdd = () => {
    setCurrentLink({
      nombre: '',
      url: '',
      roles: ['admin'] // Admin por defecto
    });
    setIsEditing(true);
  };

  const handleEdit = (link) => {
    setCurrentLink({ ...link });
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este enlace?")) return;
    try {
      await deleteDashboardLink(id);
      loadLinks();
    } catch (err) {
      console.error(err);
      alert("Error al eliminar");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!currentLink.nombre || !currentLink.url) {
      alert("Nombre y URL son obligatorios.");
      return;
    }
    
    setSaving(true);
    try {
      await saveDashboardLink(currentLink);
      setIsEditing(false);
      setCurrentLink(null);
      loadLinks();
    } catch (err) {
      console.error(err);
      alert("Error al guardar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (roleId) => {
    const roles = currentLink.roles || [];
    if (roles.includes(roleId)) {
      setCurrentLink({ ...currentLink, roles: roles.filter(r => r !== roleId) });
    } else {
      setCurrentLink({ ...currentLink, roles: [...roles, roleId] });
    }
  };

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Gestor de Dashboards"
        subtitle="Administra los enlaces de PowerBI/Sheets y asigna permisos por rol."
        icon={BarChart3}
        actions={
          !isEditing && (
            <button 
              onClick={handleAdd}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Nuevo Dashboard
            </button>
          )
        }
      />

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-sm flex items-center gap-2 rounded-xl">
          <AlertTriangle size={18} />
          {errorMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {isEditing ? (
          <Card className="max-w-2xl mx-auto">
            <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">{currentLink.id ? 'Editar Dashboard' : 'Nuevo Dashboard'}</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">Nombre del Dashboard</label>
                <input 
                  type="text" 
                  value={currentLink.nombre}
                  onChange={e => setCurrentLink({...currentLink, nombre: e.target.value})}
                  className="form-input w-full"
                  placeholder="Ej: Deserción Semanal"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">URL (PowerBI o Google Sheets)</label>
                <input 
                  type="url" 
                  value={currentLink.url}
                  onChange={e => setCurrentLink({...currentLink, url: e.target.value})}
                  className="form-input w-full"
                  placeholder="https://app.powerbi.com/view?..."
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Permisos (Roles autorizados)</label>
                <div className="flex flex-wrap gap-3">
                  {appRoles.map(role => (
                    <label key={role.id} className={`flex items-center gap-2 border px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                      (currentLink.roles || []).includes(role.id) 
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]' 
                        : 'bg-[var(--bg-muted)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)]'
                    }`}>
                      <input 
                        type="checkbox"
                        checked={(currentLink.roles || []).includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="rounded text-[var(--accent)] focus:ring-[var(--accent)] bg-transparent border-[var(--border-normal)]"
                      />
                      <span className="text-sm font-medium">{role.label}</span>
                    </label>
                  ))}
                </div>
                {(currentLink.roles || []).length === 0 && (
                  <p className="text-xs text-rose-500 mt-1">Debes seleccionar al menos un rol.</p>
                )}
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving || (currentLink.roles || []).length === 0}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : <><Save size={16} /> Guardar</>}
                </button>
              </div>
            </form>
          </Card>
        ) : (
          <Card noPadding className="overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-[var(--text-muted)]">Cargando enlaces...</div>
            ) : links.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                <Link size={48} className="mx-auto text-[var(--border-normal)] mb-3" />
                <p>No hay Dashboards configurados.</p>
                <p className="text-sm mt-1">Haz clic en "Nuevo Dashboard" para comenzar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase text-xs tracking-wider">
                    <tr>
                      <th className="p-4 font-bold">Nombre</th>
                      <th className="p-4 font-bold">Roles Autorizados</th>
                      <th className="p-4 font-bold">URL</th>
                      <th className="p-4 font-bold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {links.map((link, idx) => (
                      <tr key={link.id} className={`hover:bg-[var(--bg-muted)] transition-colors ${idx % 2 === 0 ? 'bg-[var(--bg-surface)]' : 'bg-[var(--bg-base)]/20'}`}>
                        <td className="p-4 font-bold text-[var(--text-primary)]">{link.nombre}</td>
                        <td className="p-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {(link.roles || []).map(r => {
                              const rInfo = appRoles.find(ar => ar.id === r)
                              return (
                                <span key={r} className="bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider shadow-sm border border-[var(--accent)]/20">
                                  {rInfo ? rInfo.label : r}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td className="p-4 text-[var(--text-muted)] max-w-xs truncate" title={link.url}>
                          {link.url}
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => handleEdit(link)}
                            className="text-[var(--text-secondary)] hover:text-[var(--accent)] p-1.5 mx-1 transition-colors rounded-lg hover:bg-[var(--accent-soft)]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(link.id)}
                            className="text-[var(--text-secondary)] hover:text-rose-500 p-1.5 mx-1 transition-colors rounded-lg hover:bg-rose-500/10"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
