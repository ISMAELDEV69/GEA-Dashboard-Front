import { useState, useEffect, useMemo } from 'react'
import {
  Users, UserPlus, Shield, RefreshCw, Search,
  ChevronDown, Check, X, Loader2, AlertCircle, Edit2,
  Crown, Mail, Lock, TrendingUp, BookOpen, Briefcase, Key, CheckSquare
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { createUserAccount, adminResetUserPassword, updateUserRole, getEquipoReclutamiento, getEquipoFormacion, updateEquipoFormacion, updateEquipoReclutamiento, fetchAppRoles } from '../lib/dataService'
import { SEGMENTOS_SIU } from '../lib/capacidadRysSync'
import PageLayout from './ui/PageLayout'
import PageHeader from './ui/PageHeader'
import Card from './ui/Card'
import { AVAILABLE_MODULES } from './RolePermissionsAdmin'

// ─────────────────────────────────────────────────────────────────────────────
// Role Badge
// ─────────────────────────────────────────────────────────────────────────────
function RoleBadge({ rol, appRoles }) {
  const defaultRole = {
    id: 'visor',
    label: 'Desconocido',
    color: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    icon: 'User'
  }
  const r = appRoles.find(ar => ar.id === rol) || defaultRole
  
  // Icon Mapping simple
  const IconComponent = {
    'Crown': Crown,
    'Briefcase': Briefcase,
    'BookOpen': BookOpen,
    'TrendingUp': TrendingUp,
    'Users': Users,
    'UserPlus': UserPlus,
    'Shield': Shield,
    'Key': Key,
    'CheckSquare': CheckSquare
  }[r.icon] || Shield

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${r.color}`}>
      <IconComponent size={11} />
      {r.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserManagement({ navPermissions = [] }) {
  const [employees,  setEmployees]  = useState([])
  const [perfiles,   setPerfiles]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [showCreate, setShowCreate] = useState(null) // Holds employee object to create account
  const [showReset,  setShowReset]  = useState(null) // Holds perfil object to reset password
  const [showEditRole, setShowEditRole] = useState(null) // Holds perfil object to change role
  const [filterRol,  setFilterRol]  = useState('all')
  const [appRoles, setAppRoles] = useState([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [formacionData, reclutamientoData, perfilesData, rolesData] = await Promise.all([
        getEquipoFormacion(),
        getEquipoReclutamiento(),
        supabase.from('perfiles').select('id, nombre, rol, created_at').order('created_at', { ascending: false }),
        fetchAppRoles()
      ])

      const profiles = perfilesData.data || []
      setPerfiles(profiles)
      setAppRoles(rolesData || [])

      const { data: { session } } = await supabase.auth.getSession()
      const currentUserId = session?.user?.id
      const currentUserEmailPrefix = session?.user?.email?.split('@')[0] || ''

      const normalize = (str) => {
        if (!str) return ''
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
      }

      const matchedProfileIds = new Set()
      
      const cleanNamePart = (part) => {
        if (!part) return ''
        const str = String(part).trim()
        return str.replace(/c?undefined/ig, '').replace(/\bnull\b/ig, '').trim()
      }

      const listF = formacionData.map(e => {
        const perfil = profiles.find(p => {
          if (!p.nombre) return false
          const pNom = normalize(p.nombre)
          const byUser = e.usuario_alix && pNom === normalize(e.usuario_alix)
          const empName = e.nombres_completos ? normalize(e.nombres_completos) : ''
          const byName = empName && (empName === pNom || ` ${empName} `.includes(` ${pNom} `))
          return byUser || byName
        }) || null
        if (perfil) matchedProfileIds.add(perfil.id)
        return {
          _key: 'F_' + e.documento,
          documento: e.documento,
          nombres: `${e.apellido_paterno || ''} ${e.apellido_materno || ''} ${e.nombres_completos || ''}`.trim().replace(/\\s+/g, ' '),
          cargo: e.cargo_funcional,
          equipo: 'Formación',
          usuario: e.usuario_alix || '',
          estado: e.estado,
          perfil,
          raw: e
        }
      })
      
      const listR = reclutamientoData.map(e => {
        const perfil = profiles.find(p => {
          if (!p.nombre) return false
          const pNom = normalize(p.nombre)
          const byUser = e.alix && pNom === normalize(e.alix)
          const empName = e.nombres_completos ? normalize(e.nombres_completos) : ''
          const byName = empName && (empName === pNom || ` ${empName} `.includes(` ${pNom} `))
          return byUser || byName
        }) || null
        if (perfil) matchedProfileIds.add(perfil.id)
        return {
          _key: 'R_' + e.documento,
          documento: e.documento,
          nombres: `${e.apellido_paterno || ''} ${e.apellido_materno || ''} ${e.nombres_completos || ''}`.trim().replace(/\\s+/g, ' '),
          cargo: e.cargo,
          equipo: 'Reclutamiento',
          usuario: e.alix || '',
          estado: e.estado,
          perfil,
          raw: e
        }
      })

      // Add orphaned profiles (users created in auth but not in HR tables)
      const listOrphans = profiles.filter(p => !matchedProfileIds.has(p.id)).map(p => ({
        _key: `perfil_${p.id}`,
        documento: '—',
        nombres: cleanNamePart(p.nombre) || 'Desconocido',
        cargo: '—',
        equipo: 'Externa / Otros',
        usuario: p.id === currentUserId && currentUserEmailPrefix ? currentUserEmailPrefix : p.nombre,
        estado: 'ACTIVO',
        perfil: p,
        raw: null
      }))

      setEmployees([...listF, ...listR, ...listOrphans])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEditAlix = async (emp) => {
    const isExternal = emp.equipo === 'Externa / Otros'
    const promptMsg = isExternal ? `Nuevo Nombre Completo para ${emp.nombres}:` : `Nuevo usuario ALIX para ${emp.nombres}:`
    const newAlix = window.prompt(promptMsg, isExternal ? emp.nombres : (emp.usuario || ''))
    if (newAlix === null || newAlix.trim() === (isExternal ? emp.nombres : (emp.usuario || '')).trim()) return
    
    try {
      setLoading(true)
      const cleanNewAlix = newAlix.trim()
      
      if (emp.equipo === 'Externa / Otros') {
        // Para huérfanos (como Admin), actualizamos directamente su nombre en el perfil
        await supabase.from('perfiles').update({ nombre: cleanNewAlix }).eq('id', emp.perfil?.id)
        
        // También intentamos actualizar su user metadata para que no se sobreescriba
        await supabase.auth.updateUser({ data: { nombre: cleanNewAlix } })
      } else {
        const updateData = emp.equipo === 'Formación' ? { usuario_alix: cleanNewAlix } : { alix: cleanNewAlix }
        if (emp.equipo === 'Formación') {
          await updateEquipoFormacion(emp.documento, updateData)
        } else {
          await updateEquipoReclutamiento(emp.documento, updateData)
        }
      }
      
      await loadData() // Refresh table
    } catch (err) {
      alert('Error al actualizar el usuario: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData() }, [])

  const filtered = employees.filter(e => {
    const matchSearch = !search ||
      e.nombres?.toLowerCase().includes(search.toLowerCase()) ||
      e.documento?.toLowerCase().includes(search.toLowerCase()) ||
      e.usuario?.toLowerCase().includes(search.toLowerCase())
      
    const matchRol = filterRol === 'all' || e.perfil?.rol === filterRol
    return matchSearch && matchRol
  })

  const counts = appRoles.reduce((acc, r) => {
    acc[r.id] = employees.filter(e => e.perfil?.rol === r.id).length
    return acc
  }, {})

  const getInitials = (nombre) => {
    if (!nombre) return '?'
    const parts = String(nombre).trim().split(/\s+/)
    if (parts.length >= 2) {
      const first = parts[0]?.[0] || ''
      const second = parts[1]?.[0] || ''
      return (first + second).toUpperCase()
    }
    return (parts[0]?.[0] || '?').toUpperCase()
  }

  return (
    <PageLayout className="space-y-6">
      <PageHeader
        title="Directorio de Usuarios"
        subtitle="Administra credenciales de acceso para Formación y Reclutamiento"
        actions={
          <button
            onClick={() => setShowCreate({ equipo: 'Externa / Otros', nombres: '', documento: '—' })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-white font-bold text-sm shadow-md hover:bg-indigo-600 transition-colors"
          >
            <UserPlus size={16} /> Agregar Usuario Externo
          </button>
        }
      />

      {/* ── Role filters ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {appRoles.map(r => {
          const Icon = Shield
          return (
            <button
              key={r.id}
              onClick={() => setFilterRol(filterRol === r.id ? 'all' : r.id)}
              className={`p-4 rounded-2xl border text-left transition-all hover:scale-[1.02] bg-[var(--bg-surface)] ${filterRol === r.id ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20' : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/50'}`}
            >
              <div className={`inline-flex p-2 rounded-xl mb-2 ${r.color}`}>
                <Icon size={14} />
              </div>
              <div className="text-2xl font-black text-[var(--text-primary)]">
                {counts[r.id] ?? 0}
              </div>
              <div className="text-[11px] font-semibold text-[var(--text-muted)]">
                {r.label}{(counts[r.id] ?? 0) !== 1 ? 's' : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, DNI o usuario..."
          className="form-input w-full pl-11 pr-4 py-3 rounded-2xl text-sm"
        />
      </div>

      {/* ── User List ── */}
      <Card noPadding className="w-full">
        {/* Table header */}
        <div className="grid grid-cols-[3fr_2fr_1fr_1fr_1.5fr] gap-4 px-6 py-3 border-b text-[10px] font-bold uppercase tracking-widest border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--table-head-bg)]">
          <span>Personal (DNI / Nombre)</span>
          <span>Cargo & Equipo</span>
          <span className="text-center">Rol</span>
          <span className="text-center">Usuario (ALIX)</span>
          <span className="text-right">Acciones</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
            <span className="text-sm text-[var(--text-muted)]">Cargando directorio...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Users size={36} className="mx-auto mb-3 opacity-20 text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--text-muted)]">
              {search ? 'Sin resultados para tu búsqueda' : 'No hay personal registrado en los equipos'}
            </p>
          </div>
        ) : (
          <div className="table-scroll divide-y divide-[var(--border-subtle)]">
            {filtered.map((emp, i) => {
              const grad = ['from-blue-500 to-indigo-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600', 'from-rose-500 to-red-600'][i % 4]
              const hasAccount = !!emp.perfil

              return (
                <div key={emp._key} className="grid grid-cols-[3fr_2fr_1fr_1fr_1.5fr] gap-4 items-center px-6 py-4 transition-colors group hover:bg-[var(--bg-muted)]">
                  
                  {/* Persona */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0 bg-gradient-to-br ${grad} shadow-md`}>
                      {getInitials(emp.nombres)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate text-[var(--text-primary)]">{emp.nombres}</p>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">DNI: {emp.documento}</p>
                    </div>
                  </div>

                  {/* Cargo & Equipo */}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate text-[var(--text-primary)]">{emp.cargo || '—'}</p>
                    <span className="text-[10px] text-[var(--text-muted)] border rounded px-1.5 py-0.5 mt-1 inline-block" style={{ borderColor: 'var(--border-subtle)' }}>
                      {emp.equipo}
                    </span>
                  </div>

                  {/* Rol (si tiene cuenta) */}
                  <div className="flex flex-col items-center gap-1">
                    {hasAccount ? (
                      <>
                        <RoleBadge rol={emp.perfil.rol} appRoles={appRoles} />
                        {emp.perfil.segmento && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/30">
                            {emp.perfil.segmento}
                          </span>
                        )}
                      </>
                    ) : <span className="text-[10px] text-[var(--text-muted)] italic text-rose-400">Falta crear clave</span>}
                  </div>

                  {/* Usuario */}
                  <div className="flex justify-center items-center gap-1.5">
                    {emp.usuario ? (
                      <span className={`px-2 py-1 border rounded font-mono text-[11px] ${hasAccount ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-white/5 text-[var(--text-primary)] border-[var(--border-subtle)]'}`}>
                        {emp.usuario}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)] italic">—</span>
                    )}
                    <button 
                      onClick={() => handleEditAlix(emp)}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--border-subtle)] text-[var(--text-muted)]"
                      title={emp.equipo === 'Externa / Otros' ? "Editar Nombre Completo" : "Editar usuario ALIX"}
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>

                  {/* Acciones */}
                  <div className="flex justify-end gap-2">
                    {hasAccount ? (
                      <>
                        <button
                          onClick={() => setShowEditRole(emp.perfil)}
                          className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
                          title="Cambiar Rol"
                        >
                          <Shield size={14} />
                        </button>
                        <button
                          onClick={() => setShowReset(emp.perfil)}
                          className="p-2 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                          title="Restablecer Contraseña"
                        >
                          <Key size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowCreate(emp)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold text-xs shadow-md hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
                      >
                        <UserPlus size={13} /> Asignar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Role permissions legend ── */}
      <Card noPadding className="overflow-hidden bg-indigo-500/5 border-indigo-500/10">
        <div className="px-5 py-3 border-b border-indigo-500/10 flex items-center gap-2">
          <Shield size={14} className="text-indigo-500 dark:text-indigo-400" />
          <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider">Permisos por rol</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {appRoles.map(r => {
            const Icon = Shield
            const roleModules = AVAILABLE_MODULES.filter(mod => {
              const dbPerm = navPermissions.find(p => p.module_id === mod.id)
              return dbPerm && dbPerm.roles.includes(r.id)
            }).map(mod => mod.label)

            const permsList = roleModules.length > 0 ? roleModules : ['Acceso básico']

            return (
              <div key={r.id} className="flex gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <div className={`p-2 rounded-xl flex-shrink-0 h-fit ${r.color}`}>
                  <Icon size={13} />
                </div>
                <div>
                  <p className="text-xs font-black mb-1 text-[var(--text-primary)]">{r.label}</p>
                  <ul className="space-y-0.5">
                    {permsList.map(p => (
                      <li key={p} className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.dotColor || 'bg-slate-400'}`} />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── MODALS ── */}
      {showCreate && (
        <CreateUserModal 
          employee={showCreate} 
          appRoles={appRoles} 
          onCreated={loadData} 
          onClose={() => setShowCreate(null)} 
        />
      )}

      {showEditRole && (
        <EditRoleModal 
          perfil={showEditRole} 
          appRoles={appRoles} 
          onUpdated={loadData} 
          onClose={() => setShowEditRole(null)} 
        />
      )}

      {showReset && (
        <ResetPasswordModal 
          perfil={showReset} 
          onClose={() => setShowReset(null)} 
        />
      )}
    </PageLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateUserModal
// ─────────────────────────────────────────────────────────────────────────────
function CreateUserModal({ employee, appRoles, onClose, onCreated }) {
  const [usuario,  setUsuario]  = useState('')
  const [password, setPassword] = useState('')
  const [rol,      setRol]      = useState(appRoles[0]?.id || 'visor')
  const [segmento, setSegmento] = useState(SEGMENTOS_SIU[0])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)
  const [externalName, setExternalName] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!usuario.trim()) {
      setError("Debe ingresar un usuario")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const cleanUser = usuario.trim()
      const generatedEmail = `${cleanUser.toLowerCase()}@gea.com`
      const displayName = employee.equipo === 'Externa / Otros' ? externalName.trim() : cleanUser
      
      // Crear en supabase
      const resUser = await createUserAccount({ email: generatedEmail, password, nombre: displayName, rol })
      
      if (rol === 'supervisor_capacitacion' && resUser?.id) {
        await supabase.from('perfiles').update({ segmento }).eq('id', resUser.id)
      }

      // Actualizar tabla de recursos humanos correspondiente
      if (employee.equipo === 'Formación') {
        await updateEquipoFormacion(employee.documento, { usuario_alix: cleanUser })
      } else if (employee.equipo === 'Reclutamiento') {
        await updateEquipoReclutamiento(employee.documento, { alix: cleanUser })
      }

      setSuccess(true)
      setTimeout(() => {
        onCreated()
        onClose()
      }, 1200)
    } catch (err) {
      setError(err.message || 'Error al crear usuario.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md animate-fadeIn shadow-2xl" noPadding>
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <UserPlus size={17} className="text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[var(--text-primary)]">Asignar Acceso</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Crear credenciales para el empleado</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-all hover:bg-[var(--bg-muted)] text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-5">
          {success && (
            <div className="p-3.5 rounded-2xl flex items-center gap-2 text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Check size={14} />
              <span className="font-bold text-xs">Acceso asignado correctamente</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-2xl flex items-start gap-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-xs mb-0.5">Error</p>
                <p className="text-[11px] opacity-90">{error}</p>
              </div>
            </div>
          )}

          {/* Datos del empleado */}
          {employee.equipo === 'Externa / Otros' ? (
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Nombre Completo del Usuario Externo</label>
              <input
                type="text"
                required
                value={externalName}
                onChange={e => setExternalName(e.target.value)}
                placeholder="ej. Juan Pérez"
                className="form-input w-full px-4 py-2.5 rounded-xl text-sm mb-2"
              />
            </div>
          ) : (
            <div className="p-3 bg-[var(--bg-muted)] border border-[var(--border-subtle)] rounded-xl space-y-1">
              <p className="text-xs font-bold text-[var(--text-primary)]">{employee.nombres}</p>
              <p className="text-[10px] text-[var(--text-muted)]">DNI: {employee.documento} | {employee.cargo || 'Sin cargo'} ({employee.equipo})</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Usuario / ALIX</label>
            <div className="relative">
              <input
                type="text"
                required
                value={usuario}
                onChange={e => setUsuario(e.target.value)}
                placeholder="ej. mlopez"
                className="form-input w-full px-4 py-2.5 rounded-xl text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Contraseña Inicial</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="form-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Rol del sistema</label>
            <div className="space-y-2">
              {appRoles.map(r => (
                <label key={r.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${rol === r.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border-subtle)] hover:border-[var(--accent)]/30'}`}>
                  <input type="radio" name="rol" value={r.id} checked={rol === r.id} onChange={() => setRol(r.id)} className="mt-1" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-primary)]">{r.label}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Selector de Segmento para Supervisor de Capacitación */}
          {rol === 'supervisor_capacitacion' && (
            <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-2 animate-fadeIn">
              <label className="block text-xs font-black text-teal-300">
                Segmento Asignado al Supervisor:
              </label>
              <select
                value={segmento}
                onChange={e => setSegmento(e.target.value)}
                className="form-input w-full px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-teal-500/40"
              >
                {SEGMENTOS_SIU.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-[10px] text-teal-400/80">
                El supervisor solo podrá ver y asignar formadores pertenecientes a este segmento.
              </p>
            </div>
          )}

          <div className="pt-2">
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 rounded-xl font-bold flex justify-center items-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Crear Acceso'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ResetPasswordModal
// ─────────────────────────────────────────────────────────────────────────────
function ResetPasswordModal({ perfil, onClose }) {
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const handleReset = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await adminResetUserPassword(perfil.id, password)

      // Marcar que debe cambiar la contraseña en el próximo login
      await supabase
        .from('perfiles')
        .update({ must_change_password: true })
        .eq('id', perfil.id)

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message || 'Error al restablecer contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm animate-fadeIn shadow-2xl" noPadding>
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <Key size={17} className="text-amber-500" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[var(--text-primary)]">Restablecer Clave</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Usuario: {perfil.nombre}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl transition-all hover:bg-[var(--bg-muted)] text-[var(--text-muted)]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleReset} className="p-5 space-y-4">
          {success && (
            <div className="p-3 rounded-xl flex items-center gap-2 text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Check size={14} />
              <span className="font-bold text-xs">Contraseña actualizada</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl flex items-start gap-2.5 text-sm" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold text-xs mb-0.5">Error</p>
                <p className="text-[11px] opacity-90">{error}</p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">Nueva Contraseña</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="form-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl font-bold flex justify-center items-center gap-2 bg-amber-500 text-white shadow-md hover:bg-amber-600 transition-colors">
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Cambiar Contraseña'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: EditRoleModal
// ─────────────────────────────────────────────────────────────────────────────
function EditRoleModal({ perfil, appRoles, onClose, onUpdated }) {
  const [role, setRole] = useState(perfil.rol || 'visor')
  const [segmento, setSegmento] = useState(perfil.segmento || SEGMENTOS_SIU[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await updateUserRole(perfil.id, role, segmento)
      onUpdated()
    } catch (err) {
      setError(err.message || 'Error al actualizar el rol')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm" noPadding>
        <div className="flex justify-between items-center p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-lg font-black text-[var(--text-primary)]">Cambiar Rol</h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Selecciona el nuevo rol para el usuario <strong className="text-white">{perfil.nombre}</strong>:
            </p>
            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {appRoles.map(r => (
                <label key={r.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${role === r.id ? 'bg-[var(--bg-elevated)] border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-gray-500'}`}>
                  <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="mt-1" />
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Shield size={14} className={role === r.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                      {r.label}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Selector de Segmento para Supervisor de Capacitación */}
          {role === 'supervisor_capacitacion' && (
            <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-1.5 animate-fadeIn">
              <label className="block text-xs font-black text-teal-300">
                Segmento Asignado:
              </label>
              <select
                value={segmento}
                onChange={e => setSegmento(e.target.value)}
                className="form-input w-full px-3 py-2 rounded-lg text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-primary)] border border-teal-500/40"
              >
                {SEGMENTOS_SIU.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-[10px] text-teal-400/80">
                El supervisor solo podrá ver y asignar formadores de este segmento.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-rose-500 font-bold bg-rose-500/10 p-2 rounded">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
