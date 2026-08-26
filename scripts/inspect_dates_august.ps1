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

$targetDates = @('2026-08-22', '2026-08-24', '2026-08-25')

$recordsOnDates = @($asistData | Where-Object { 
    $d = Parse-Date $_.fecha_registro_asistencia
    $targetDates -contains $d
})

Write-Output "Total registros en fechas 22, 24, 25 de Agosto 2026: $($recordsOnDates.Count)"

$bajasOnDates = @()
$seen = @{}

foreach ($r in $recordsOnDates) {
    $doc = "$($r.documento)".Trim()
    $sigla = "$($r.sigla)".Trim().ToUpper()
    $estado = "$($r.estado)".Trim().ToUpper()
    $motivo = "$($r.motivo_baja)".Trim().ToUpper()
    $fecha = Parse-Date $r.fecha_registro_asistencia

    $isBajaResumen = ($sigla -eq 'B' -or $motivo -match 'BAJA' -or $estado -eq 'CESADO' -or $estado -eq 'BAJA' -or $estado -eq 'INACTIVO')
    $isD1 = Test-BajaDia1 $motivo $sigla $r
    $isBajaMotivos = (-not $isD1) -and ($sigla -eq 'B' -or $sigla -eq 'BAJA' -or ($motivo -ne '' -and $motivo -ne 'NULL')) -and ($sigla -ne 'ASISTIO' -and $sigla -ne 'A')

    if ($isBajaResumen -and -not $seen.ContainsKey($doc)) {
        $seen[$doc] = $true
        $bajasOnDates += [PSCustomObject]@{
            Fecha = $fecha
            Doc = $doc
            Nombre = "$($r.nombres) $($r.apellido_paterno)"
            Grupo = $r.codigo_grupo
            Campana = $r.campana
            Sigla = $sigla
            Estado = $estado
            Motivo = $motivo
            EsBajaDia1 = $isD1
            EntraEnMotivosBI = $isBajaMotivos
        }
    }
}

Write-Output ""
Write-Output "--- REGISTROS CLASIFICADOS COMO BAJA EN ESAS FECHAS ---"
$bajasOnDates | Format-Table Fecha, Doc, Grupo, Campana, Sigla, Estado, EsBajaDia1, EntraEnMotivosBI, Motivo -AutoSize
