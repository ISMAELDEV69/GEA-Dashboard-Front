import NominaForm from '../components/NominaForm'

export default function NominaSmoke() {
  return (
    <div id="nomina-smoke-root" className="min-h-screen p-8" style={{ backgroundColor: 'var(--bg-base)' }}>
      <NominaForm
        reclutadores={['TEST RECLUTADOR']}
        sedes={['SAN ISIDRO']}
        campanas={[{ nombre: 'RETENCIONES' }]}
        grupos={[]}
        formadores={[]}
        postulantes={[]}
        asistencias={[]}
        userProfile={{ nombre: 'Test', rol: 'reclutador' }}
        onSave={async () => ({ nomina_id: 1, grupo_codigo: 'GPE-TEST' })}
      />
    </div>
  )
}
