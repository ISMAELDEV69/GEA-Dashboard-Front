import React, { useState, useEffect } from 'react'
import { Shield, Loader2, Save, Check } from 'lucide-react'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'
import { fetchModulePermissions, updateModulePermissions } from '../lib/dataService'

const ROLES = ['admin', 'reclutador', 'formador', 'visor', 'supervisor_capacitacion', 'coordinador_rys', 'jefe_rys', 'jefe_capacitacion']
// Note: 'perfil' and other non-module views are not included here, only manageable ones
export const AVAILABLE_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'metas', label: 'Metas y Equipos' },
  { id: 'capacidad', label: 'Capacidad RYS' },
  { id: 'legacy_dashboards', label: 'Dashboards' },
  { id: 'attendancebi', label: 'Analítica BI' },
  { id: 'consolidado', label: 'Consolidado BI' },
  { id: 'motivos_bajas_bi', label: 'Motivos Bajas' },
  { id: 'descuentos_bi', label: 'Motivos Desc.' },
  { id: 'propuestas', label: 'Propuestas' },
  { id: 'descuentos_form', label: 'Cargar Descuentos' },
  { id: 'descuentos_auth', label: 'Autorizar RYS' },
  { id: 'nomina', label: 'Bolsa de Postulantes' },
  { id: 'nominas_completar', label: 'Nóminas' },
  { id: 'reportedia1', label: 'Reporte Día 1' },
  { id: 'asistencia', label: 'Asistencias' },
  { id: 'auditlogs', label: 'Auditoría' },
  { id: 'users', label: 'Usuarios' },
  { id: 'equipo_reclutamiento', label: 'Eq. Reclutamiento' },
  { id: 'equipo_formacion', label: 'Equipo Formación' },
  { id: 'asignacion_formador', label: 'Asignar Formador' },
  { id: 'config', label: 'Configuraciones' },
  { id: 'dashboards_admin', label: 'Gestor Dashboards' },
  { id: 'role_permissions', label: 'Permisos de Roles' }
]

export default function RolePermissionsAdmin() {
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [successRow, setSuccessRow] = useState(null)

  useEffect(() => {
    loadPermissions()
  }, [])

  const loadPermissions = async () => {
    setLoading(true)
    try {
      const data = await fetchModulePermissions()
      setPermissions(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (moduleId, role) => {
    // Current roles for this module
    const currentModule = permissions.find(p => p.module_id === moduleId)
    let currentRoles = currentModule ? [...currentModule.roles] : ['admin'] // fallback
    
    // Toggle
    if (currentRoles.includes(role)) {
      currentRoles = currentRoles.filter(r => r !== role)
    } else {
      currentRoles.push(role)
    }

    // Always ensure admin has access to role_permissions to prevent lockout
    if (moduleId === 'role_permissions' && role === 'admin' && !currentRoles.includes('admin')) {
      currentRoles.push('admin')
      alert("No puedes quitarle el acceso al administrador para este módulo.")
      return
    }

    try {
      setSaving(`${moduleId}-${role}`)
      await updateModulePermissions(moduleId, currentRoles)
      
      // Update local state
      setPermissions(prev => {
        const existing = prev.find(p => p.module_id === moduleId)
        if (existing) {
          return prev.map(p => p.module_id === moduleId ? { ...p, roles: currentRoles } : p)
        } else {
          return [...prev, { module_id: moduleId, roles: currentRoles }]
        }
      })

      setSuccessRow(`${moduleId}-${role}`)
      setTimeout(() => setSuccessRow(null), 2000)
    } catch (err) {
      console.error(err)
      alert(`Error al actualizar el permiso: ${err.message || JSON.stringify(err)}`)
    } finally {
      setSaving(null)
    }
  }

  const getRoleAccess = (moduleId, role) => {
    const currentModule = permissions.find(p => p.module_id === moduleId)
    if (!currentModule) return false // Deny by default if no DB record
    return currentModule.roles.includes(role)
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Gestor de Permisos por Rol"
        subtitle="Habilita o deshabilita los módulos de navegación para cada tipo de usuario."
        icon={Shield}
      />

      <Card noPadding className="overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center text-[var(--text-muted)]">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : (
          <div className="table-scroll overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-[var(--table-head-bg)] border-b border-[var(--border-subtle)]">
                  <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-[var(--text-muted)]">Módulo</th>
                  {ROLES.map(role => (
                    <th key={role} className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-[var(--text-muted)] text-center">
                      {role === 'visor' ? 'Directivo (Visor)' : role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {AVAILABLE_MODULES.map(module => (
                  <tr key={module.id} className="transition-colors hover:bg-[var(--bg-muted)] group">
                    <td className="px-6 py-4 font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {module.label}
                      <div className="text-[10px] font-normal mt-0.5 opacity-50 font-mono">
                        {module.id}
                      </div>
                    </td>
                    
                    {ROLES.map(role => {
                      const hasAccess = getRoleAccess(module.id, role)
                      const isSaving = saving === `${module.id}-${role}`
                      const isSuccess = successRow === `${module.id}-${role}`
                      
                      // For admin, it's safer to always have access, but we let them toggle except for role_permissions
                      const isDisabled = module.id === 'role_permissions' && role === 'admin'

                      return (
                        <td key={role} className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleToggle(module.id, role)}
                            disabled={isDisabled || isSaving}
                            className={`
                              w-6 h-6 rounded-md inline-flex items-center justify-center transition-all
                              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
                              ${hasAccess 
                                ? 'bg-indigo-500 text-white' 
                                : 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-transparent'}
                            `}
                          >
                            {isSaving ? (
                              <Loader2 size={12} className="animate-spin text-white" />
                            ) : isSuccess ? (
                              <Check size={14} className={hasAccess ? 'text-white' : 'text-indigo-500'} />
                            ) : hasAccess ? (
                              <Check size={14} />
                            ) : null}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      <div className="px-2 pb-6">
        <p className="text-xs text-[var(--text-muted)]">
          * Nota: Los cambios se guardan instantáneamente, pero los usuarios conectados deberán recargar la página (F5) para ver sus nuevos menús reflejados.
        </p>
      </div>
    </PageLayout>
  )
}
