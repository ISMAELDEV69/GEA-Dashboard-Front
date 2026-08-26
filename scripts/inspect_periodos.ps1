$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

# 1. Traer capacidad_rys
$capUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=codigo,campana,periodo,segmento,semana_label,semana_trabajo"
$capData = Invoke-RestMethod -Uri $capUrl -Headers $headers -Method GET

Write-Output "--- PERIODOS Y SEMANAS EN CAPACIDAD_RYS ---"
$capData | Group-Object periodo | Select-Object Name, Count | Format-Table -AutoSize
$capData | Group-Object semana_label | Select-Object Name, Count | Format-Table -AutoSize

# 2. Traer consolidado_asistencias (solo columnas reales)
$cUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?select=fecha_registro_asistencia,codigo_grupo,grupo,sigla,motivo_baja,estado&limit=500"
$sampleCons = Invoke-RestMethod -Uri $cUrl -Headers $headers -Method GET

Write-Output "--- SAMPLE CONSOLIDADO_ASISTENCIAS ---"
$sampleCons | Select-Object -First 10 | Format-Table -AutoSize
