$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

$capUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=codigo,campana,periodo,segmento,semana_label,semana_trabajo,fecha_inicio_ojt&periodo=eq.202608"
$grupos202608 = Invoke-RestMethod -Uri $capUrl -Headers $headers -Method GET

Write-Output "Total grupos 202608: $($grupos202608.Count)"
$grupos34 = @($grupos202608 | Where-Object { "$($_.semana_label)" -match '34' -or "$($_.semana_trabajo)" -eq '34' })

Write-Output "Grupos 202608 en Semana 34: $($grupos34.Count)"
$grupos34 | Format-Table codigo, campana, segmento, semana_label, semana_trabajo, fecha_inicio_ojt -AutoSize

$codigos = $grupos34 | ForEach-Object { "$($_.codigo)".Trim() }
Write-Output "Codigos:"
Write-Output ($codigos -join ", ")

# Traer asistencias de estos grupos en consolidado_asistencias
# Supabase PostgREST in filter
$codigosFilter = ($codigos | ForEach-Object { "`"$_`"" }) -join ','
$asistUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?codigo_grupo=in.($codigosFilter)&select=documento,nombres,apellido_paterno,codigo_grupo,campana,fecha_registro_asistencia,sigla,motivo_baja,estado"
$asistData = Invoke-RestMethod -Uri $asistUrl -Headers $headers -Method GET

Write-Output ""
Write-Output "Asistencias encontradas por codigo_grupo: $($asistData.Count)"

if ($asistData.Count -eq 0) {
    # Probar con campo grupo
    $asistUrl2 = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?grupo=in.($codigosFilter)&select=documento,nombres,apellido_paterno,grupo,campana,fecha_registro_asistencia,sigla,motivo_baja,estado"
    $asistData = Invoke-RestMethod -Uri $asistUrl2 -Headers $headers -Method GET
    Write-Output "Asistencias encontradas por campo grupo: $($asistData.Count)"
}

Write-Output ""
Write-Output "--- REGISTROS DE ASISTENCIA ---"
$asistData | Format-Table documento, fecha_registro_asistencia, sigla, estado, motivo_baja, codigo_grupo, grupo -AutoSize

# Agrupar por fechas
Write-Output ""
Write-Output "--- DISTRIBUCION POR FECHA_REGISTRO_ASISTENCIA ---"
$asistData | Group-Object fecha_registro_asistencia | Select-Object Name, Count | Format-Table -AutoSize
