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

# Filtrar asistencias con fecha en agosto 2026 (Semana 34)
$targetDates = @('2026-08-22', '2026-08-24', '2026-08-25')
$asistSemana34 = @($asistData | Where-Object { 
    $d = Parse-Date $_.fecha_registro_asistencia
    $targetDates -contains $d
})

$dailyBajas = @{}
$seen = @{}

$sorted = $asistSemana34 | Sort-Object { 
    $p = Parse-Date $_.fecha_registro_asistencia
    [string]$p 
}

foreach ($a in $sorted) {
    $doc = "$($a.documento)".Trim()
    if ((Test-BajaCapacitacion $a) -and $doc) {
        if (-not $seen.ContainsKey($doc)) {
            $seen[$doc] = $true
            $date = Parse-Date $a.fecha_registro_asistencia
            if ($date -and $date.Length -eq 10) {
                if (-not $dailyBajas.ContainsKey($date)) { $dailyBajas[$date] = 0 }
                $dailyBajas[$date]++
            }
        }
    }
}

$datesSorted = $dailyBajas.Keys | Sort-Object { [string]$_ }
$cum = 0
$chartPoints = @()
foreach ($d in $datesSorted) {
    $cum += $dailyBajas[$d]
    $chartPoints += [PSCustomObject]@{
        Fecha = $d
        BajasDia = $dailyBajas[$d]
        BajasAcumuladas = $cum
    }
}

Write-Output "========================================================================"
Write-Output "RESULTADO TRAS LA UNIFICACION (CURVA DE DESERCION SEMANA 34):"
Write-Output "========================================================================"
$chartPoints | Format-Table -AutoSize
Write-Output "TOTAL BAJAS ACUMULADAS: $cum"
