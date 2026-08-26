$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

$capUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=codigo,campana,periodo,segmento,semana_label,semana_trabajo,fecha_inicio_ojt&periodo=eq.202608"
$grupos202608 = Invoke-RestMethod -Uri $capUrl -Headers $headers -Method GET
$grupos34 = @($grupos202608 | Where-Object { "$($_.semana_label)" -match '34' -or "$($_.semana_trabajo)" -eq '34' })
$codigos = @($grupos34 | ForEach-Object { "$($_.codigo)".Trim() })
$codigosFilter = ($codigos | ForEach-Object { "`"$_`"" }) -join ','

$asistUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?codigo_grupo=in.($codigosFilter)&select=documento,nombres,apellido_paterno,codigo_grupo,campana,fecha_registro_asistencia,sigla,motivo_baja,estado"
$asistData = Invoke-RestMethod -Uri $asistUrl -Headers $headers -Method GET

function Parse-Date($dStr) {
    if (-not $dStr) { return $null }
    $s = "$dStr".Trim()
    if ($s -match '^(\d{4})-(\d{2})-(\d{2})') { return "$($Matches[1])-$($Matches[2])-$($Matches[3])" }
    if ($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
        return "$($Matches[3])-$($Matches[2].PadLeft(2,'0'))-$($Matches[1].PadLeft(2,'0'))"
    }
    return $s
}

function Test-BajaDia1($motivo, $sigla, $row) {
    $m = "$motivo".Trim().ToUpper()
    $s = "$sigla".Trim().ToUpper()
    $t = "$($row.tipo_baja)$($row.tipo)".Trim().ToUpper()

    if ($t -match 'DIA_1' -or $t -match 'DIA 1' -or $t -match 'D1') { return $true }
    if ($s -eq 'BD1' -or $s -eq 'D1') { return $true }
    if ($m -eq 'BAJA DIA 1' -or $m -eq 'BAJA DÍA 1' -or $m -eq 'BAJA D1' -or $m -eq 'DÍA 1' -or $m -eq 'DIA 1' -or $m -match 'BAJA DIA 1' -or $m -match 'BAJA DÍA 1' -or $m -match 'BAJA D1' -or $m -match '\(BAJA DIA 1\)' -or $m -match '\(BAJA DÍA 1\)') { return $true }
    return $false
}

function Test-BajaCapacitacion($row) {
    $motivo = "$($row.motivo_baja)$($row.motivo)"
    $sigla = "$($row.sigla)$($row.sigla_asistencia)"
    if (Test-BajaDia1 $motivo $sigla $row) { return $false }
    $s = "$sigla".Trim().ToUpper()
    $m = "$motivo".Trim().ToUpper()
    $e = "$($row.estado)".Trim().ToUpper()

    return (
        $s -eq 'B' -or
        $s -eq 'BAJA' -or
        $e -eq 'CESADO' -or
        ($e -match 'BAJA' -and -not ($e -match 'BAJA DIA 1' -or $e -match 'BAJA DÍA 1')) -or
        ($m -ne '' -and $m -ne 'NULL' -and $m -ne 'ASISTIO' -and $m -ne 'ACTIVO')
    ) -and ($s -ne 'ASISTIO' -and $s -ne 'A' -and $s -ne 'I-OP')
}

# 1. MotivosBajasBI
$seenMB = @{}
$mbBajas = 0
foreach ($a in $asistData) {
    $doc = "$($a.documento)".Trim()
    if ((Test-BajaCapacitacion $a) -and $doc -and -not $seenMB.ContainsKey($doc)) {
        $seenMB[$doc] = $true
        $mbBajas++
    }
}

# 2. ResumenCapacitacion
$seenRC = @{}
$rcBajas = 0
foreach ($a in $asistData) {
    $doc = "$($a.documento)".Trim()
    if ((Test-BajaCapacitacion $a) -and $doc -and -not $seenRC.ContainsKey($doc)) {
        $seenRC[$doc] = $true
        $rcBajas++
    }
}

# 3. AttendanceBI
$seenAtt = @{}
$attBajas = 0
$attBajasD1 = 0
$seenD1 = @{}
foreach ($a in $asistData) {
    $doc = "$($a.documento)".Trim()
    if (Test-BajaDia1 "$($a.motivo_baja)" "$($a.sigla)" $a) {
        if (-not $seenD1.ContainsKey($doc)) {
            $seenD1[$doc] = $true
            $attBajasD1++
        }
    } elseif ((Test-BajaCapacitacion $a) -and $doc -and -not $seenAtt.ContainsKey($doc)) {
        $seenAtt[$doc] = $true
        $attBajas++
    }
}

# 4. ConsolidadoPowerBI con la propuesta
$latestDoc = @{}
foreach ($a in $asistData) {
    $doc = "$($a.documento)".Trim()
    if (-not $doc) { continue }
    $d = Parse-Date $a.fecha_registro_asistencia
    $time = if ($d) { [datetime]::ParseExact($d, 'yyyy-MM-dd', $null).Ticks } else { 0 }
    if (-not $latestDoc.ContainsKey($doc) -or $time -ge $latestDoc[$doc].Time) {
        $latestDoc[$doc] = @{ Time = $time; Row = $a }
    }
}

$cpbBajas = 0
$cpbBajasD1 = 0
foreach ($entry in $latestDoc.Values) {
    $row = $entry.Row
    if (Test-BajaDia1 "$($row.motivo_baja)" "$($row.sigla)" $row) {
        $cpbBajasD1++
    } elseif (Test-BajaCapacitacion $row) {
        $cpbBajas++
    }
}

Write-Output "=========================================================================="
Write-Output "VERIFICACION CRUZADA DE BAJAS DE CAPACITACION (PERIODO 202608 | SEMANA 34)"
Write-Output "=========================================================================="
Write-Output "1. Motivos de Bajas BI    : $mbBajas bajas de capacitacion"
Write-Output "2. Resumen Capacitacion   : $rcBajas bajas de capacitacion"
Write-Output "3. Attendance BI          : $attBajas bajas de capacitacion (+$attBajasD1 bajas Dia 1 separadas)"
Write-Output "4. Consolidado PowerBI    : $cpbBajas bajas de capacitacion (+$cpbBajasD1 bajas Dia 1 separadas)"
Write-Output "=========================================================================="
