$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

# 1. Traer capacidad_rys
$capUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=codigo,campana,meta_dia_1,rq_solicitado,fecha_inicio_ojt,periodo,segmento,semana_label,semana_trabajo"
$capData = Invoke-RestMethod -Uri $capUrl -Headers $headers -Method GET

# Filtrar grupos de Periodo 202608 y Semana 34
$grupos34 = @($capData | Where-Object { 
    $p = "$($_.periodo)".Trim()
    $sem = ("$($_.semana_label)" + "$($_.semana_trabajo)") -replace '\D',''
    $p -eq '202608' -and $sem -eq '34'
})

Write-Output "==============================================================="
Write-Output "GRUPOS EN CAPACIDAD_RYS (Periodo: 202608, Semana: 34): $($grupos34.Count)"
Write-Output "==============================================================="
foreach ($g in $grupos34) {
    Write-Output "Codigo: $($g.codigo) | Campana: $($g.campana) | Segmento: $($g.segmento) | OJT: $($g.fecha_inicio_ojt)"
}

$codigosGpe = @($grupos34 | ForEach-Object { "$($_.codigo)".Trim().ToUpper() })

# 2. Traer asistencias de consolidado_asistencias
# Buscar todos los registros de consolidado
$asistencias = @()
$from = 0
$step = 1000
while ($true) {
    $cUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?select=*&offset=$from&limit=$step"
    $batch = Invoke-RestMethod -Uri $cUrl -Headers $headers -Method GET
    if ($null -eq $batch -or $batch.Count -eq 0) { break }
    $asistencias += $batch
    if ($batch.Count -lt $step) { break }
    $from += $step
}

Write-Output ""
Write-Output "Total registros en consolidado_asistencias: $($asistencias.Count)"

# Filtrar por grupos de semana 34
$asist34 = @($asistencias | Where-Object {
    $code = ("$($_.codigo_grupo)" + "$($_.grupo)").Trim().ToUpper()
    $codigosGpe -contains $code
})

Write-Output "Total asistencias registradas para grupos Semana 34: $($asist34.Count)"

# Función isBajaDia1
function Test-BajaDia1($motivo, $sigla, $row) {
    $m = "$motivo".Trim().ToUpper()
    $s = "$sigla".Trim().ToUpper()
    $t = "$($row.tipo_baja)$($row.tipo)".Trim().ToUpper()

    if ($t -match 'DIA_1' -or $t -match 'DIA 1' -or $t -match 'D1') { return $true }
    if ($s -eq 'BD1' -or $s -eq 'D1') { return $true }
    if ($m -eq 'BAJA DIA 1' -or $m -eq 'BAJA DÍA 1' -or $m -eq 'BAJA D1' -or $m -eq 'DÍA 1' -or $m -eq 'DIA 1' -or $m -match 'BAJA DIA 1' -or $m -match 'BAJA DÍA 1' -or $m -match 'BAJA D1') { return $true }
    return $false
}

# Evaluar según Criterio ResumenCapacitacion.jsx
# ResumenCapacitacion ordena por fecha y toma la primera baja encontrada:
# isBaja = sigla === 'B' || motivo.includes('BAJA') || estado === 'CESADO' || estado === 'BAJA' || estado === 'INACTIVO'
$seenResumen = @{}
$bajasResumen = @()

$sortedAsist = $asist34 | Sort-Object { [string]$_.fecha_registro_asistencia }

foreach ($r in $sortedAsist) {
    $doc = "$($r.documento)".Trim()
    $sigla = "$($r.sigla)".Trim().ToUpper()
    $estado = "$($r.estado)".Trim().ToUpper()
    $motivo = "$($r.motivo_baja)".Trim().ToUpper()
    $fecha = "$($r.fecha_registro_asistencia)"

    $isBajaResumen = ($sigla -eq 'B' -or $motivo -match 'BAJA' -or $estado -eq 'CESADO' -or $estado -eq 'BAJA' -or $estado -eq 'INACTIVO')

    if ($isBajaResumen -and $doc -and -not $seenResumen.ContainsKey($doc)) {
        $seenResumen[$doc] = $true
        $isD1 = Test-BajaDia1 $motivo $sigla $r
        $bajasResumen += [PSCustomObject]@{
            Documento = $doc
            Nombre = "$($r.nombres) $($r.apellido_paterno)"
            Grupo = "$($r.codigo_grupo)$($r.grupo)"
            Campana = $r.campana
            Fecha = $fecha
            Sigla = $sigla
            Estado = $estado
            Motivo = $motivo
            EsBajaDia1 = $isD1
        }
    }
}

# Evaluar según Criterio MotivosBajasBI.jsx
# MotivosBajasBI:
# isDia1 = isBajaDia1(...)
# isBaja = !isDia1 && (sigla === 'B' || sigla === 'BAJA' || motivo !== '') && sigla !== 'ASISTIO' && sigla !== 'A'
$seenMotivos = @{}
$bajasMotivos = @()

foreach ($r in $sortedAsist) {
    $doc = "$($r.documento)".Trim()
    $sigla = "$($r.sigla)".Trim().ToUpper()
    $estado = "$($r.estado)".Trim().ToUpper()
    $motivo = "$($r.motivo_baja)".Trim().ToUpper()
    $fecha = "$($r.fecha_registro_asistencia)"

    $isD1 = Test-BajaDia1 $motivo $sigla $r
    $isBajaMotivos = (-not $isD1) -and ($sigla -eq 'B' -or $sigla -eq 'BAJA' -or ($motivo -ne '' -and $motivo -ne 'NULL')) -and ($sigla -ne 'ASISTIO' -and $sigla -ne 'A')

    if ($isBajaMotivos -and $doc -and -not $seenMotivos.ContainsKey($doc)) {
        $seenMotivos[$doc] = $true
        $bajasMotivos += [PSCustomObject]@{
            Documento = $doc
            Nombre = "$($r.nombres) $($r.apellido_paterno)"
            Grupo = "$($r.codigo_grupo)$($r.grupo)"
            Campana = $r.campana
            Fecha = $fecha
            Sigla = $sigla
            Estado = $estado
            Motivo = $motivo
        }
    }
}

Write-Output ""
Write-Output "========================================================================"
Write-Output "RESUMEN COMPARATIVO:"
Write-Output "  - ResumenCapacitacion.jsx (Curva Deserción): $($bajasResumen.Count) bajas"
Write-Output "  - MotivosBajasBI.jsx      (Bajas Netas)   : $($bajasMotivos.Count) bajas"
Write-Output "========================================================================"

Write-Output ""
Write-Output "--- DETALLE DE LAS $($bajasResumen.Count) BAJAS REPORTADAS POR RESUMEN CAPACITACION ---"
$bajasResumen | Format-Table Documento, Fecha, Grupo, Sigla, Estado, EsBajaDia1, Motivo -AutoSize

Write-Output ""
Write-Output "--- DETALLE DE LAS $($bajasMotivos.Count) BAJAS REPORTADAS POR MOTIVOS DE BAJAS BI ---"
$bajasMotivos | Format-Table Documento, Fecha, Grupo, Sigla, Estado, Motivo -AutoSize

# Distribución por Fechas en ResumenCapacitacion
Write-Output ""
Write-Output "--- DISTRIBUCION POR FECHAS EN RESUMEN CAPACITACION (Eje X de la Curva) ---"
$bajasResumen | Group-Object Fecha | Select-Object Name, Count | Format-Table -AutoSize
