import AdminDashboard from './dashboard/AdminDashboard'
import ReclutadorDashboard from './dashboard/ReclutadorDashboard'
import FormadorDashboard from './dashboard/FormadorDashboard'
import VisorDashboard from './dashboard/VisorDashboard'

export default function Dashboard({
  postulantes = [],
  asistencias = [],
  grupos = [],
  role = 'visor',
  userProfile = null,
  campanasMetas = [],
  formadores = [],
  reclutadores = [],
}) {
  const props = { postulantes, asistencias, grupos, userProfile, campanasMetas, formadores, reclutadores }

  switch (role || 'visor') {
    case 'admin':
      return <AdminDashboard {...props} />
    case 'reclutador':
      return <ReclutadorDashboard {...props} />
    case 'formador':
      return <FormadorDashboard {...props} />
    case 'visor':
    default:
      return <VisorDashboard {...props} />
  }
}

