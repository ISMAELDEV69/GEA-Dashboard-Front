$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

# 1. Traer capacidad_rys de 202608
$capUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=codigo,campana,periodo,segmento,semana_label,semana_trabajo,fecha_inicio_ojt&periodo=eq.202608"
$grupos202608 = Invoke-RestMethod -Uri $capUrl -Headers $headers -Method GET
$grupos34 = @($grupos202608 | Where-Object { "$($_.semana_label)" -match '34' -or "$($_.semana_trabajo)" -eq '34' })

$codigos = @($grupos34 | ForEach-Object { "$($_.codigo)".Trim() })
$codigosFilter = ($codigos | ForEach-Object { "`"$_`"" }) -join ','

# 2. Traer asistencias de consolidado_asistencias
$asistUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?codigo_grupo=in.($codigosFilter)&select=documento,nombres,apellido_paterno,codigo_grupo,campana,fecha_registro_asistencia,sigla,motivo_baja,estado"
$asistData = Invoke-RestMethod -Uri $asistUrl -Headers $headers -Method GET

function Test-BajaDia1($motivo, $sigla, $row) {
    $m = "$motivo".Trim().ToUpper()
    $s = "$sigla".Trim().ToUpper()
    $t = "$($row.tipo_baja)$($row.tipo)".Trim().ToUpper()

    if ($t -match 'DIA_1' -or $t -match 'DIA 1' -or $t -match 'D1') { return $true }
    if ($s -eq 'BD1' -or $s -eq 'D1') { return $true }
    if ($m -eq 'BAJA DIA 1' -or $m -eq 'BAJA DÍA 1' -or $m -eq 'BAJA D1' -or $m -eq 'DÍA 1' -or $m -eq 'DIA 1' -or $m -match 'BAJA DIA 1' -or $m -match 'BAJA DÍA 1' -or $m -match 'BAJA D1' -or $m -match '\(BAJA DIA 1\)' -or $m -match '\(BAJA DÍA 1\)') { return $true }
    return $false
}

$seenResumen = @{}
$bajasResumen = @()

$sorted = $asistData | Sort-Object { [string]$_.fecha_registro_asistencia }

foreach ($r in $sorted) {
    $doc = "$($r.documento)".Trim()
    $sigla = "$($r.sigla)".Trim().ToUpper()
    $estado = "$($r.estado)".Trim().ToUpper()
    $motivo = "$($r.motivo_baja)".Trim().ToUpper()
    $fecha = "$($r.fecha_registro_asistencia)"

    # Criterio ResumenCapacitacion.jsx
    $isBajaResumen = ($sigla -eq 'B' -or $motivo -match 'BAJA' -or $estado -eq 'CESADO' -or $estado -eq 'BAJA' -or $estado -eq 'INACTIVO')

    if ($isBajaResumen -and $doc -and -not $seenResumen.ContainsKey($doc)) {
        $seenResumen[$doc] = $true
        $isD1 = Test-BajaDia1 $motivo $sigla $r
        $bajasResumen += [PSCustomObject]@{
            Documento = $doc
            Nombre = "$($r.nombres) $($r.apellido_paterno)"
            Grupo = "$($r.codigo_grupo)"
            Campana = $r.campana
            Fecha = $fecha
            Sigla = $sigla
            Estado = $estado
            Motivo = $motivo
            EsBajaDia1 = $isD1
        }
    }
}

# Criterio MotivosBajasBI.jsx
$seenMotivos = @{}
$bajasMotivos = @()

foreach ($r in $sorted) {
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
            Grupo = "$($r.codigo_grupo)"
            Campana = $r.campana
            Fecha = $fecha
            Sigla = $sigla
            Estado = $estado
            Motivo = $motivo
        }
    }
}

Write-Output "=========================================================================================="
Write-Output "AUDITORIA DE BAJAS: PERIODO 202608 | SEMANA 34"
Write-Output "  - Total Bajas en ResumenCapacitacion.jsx (Curva Deserción): $($bajasResumen.Count)"
Write-Output "  - Total Bajas en MotivosBajasBI.jsx (Bajas Capacitación Netas): $($bajasMotivos.Count)"
Write-Output "=========================================================================================="

Write-Output ""
Write-Output "--- TODAS LAS $($bajasResumen.Count) BAJAS ENCONTRADAS POR RESUMEN CAPACITACION ---"
$bajasResumen | Format-Table Documento, Fecha, Grupo, Sigla, Estado, EsBajaDia1, Motivo -AutoSize

Write-Output ""
Write-Output "--- TODAS LAS $($bajasMotivos.Count) BAJAS ENCONTRADAS POR MOTIVOS DE BAJAS BI ---"
$bajasMotivos | Format-Table Documento, Fecha, Grupo, Sigla, Estado, Motivo -AutoSize

Write-Output ""
Write-Output "--- FECHAS PRESENTES EN LA CURVA DE DESERCION (EJE X) ---"
$bajasResumen | Group-Object Fecha | Select-Object Name, Count | Format-Table -AutoSize
