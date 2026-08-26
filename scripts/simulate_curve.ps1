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

# Parse dates in dd/MM/yyyy and yyyy-MM-dd
function Parse-Date($dStr) {
    if (-not $dStr) { return $null }
    $s = "$dStr".Trim()
    if ($s -match '^(\d{4})-(\d{2})-(\d{2})') {
        return "$($Matches[1])-$($Matches[2])-$($Matches[3])"
    }
    if ($s -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
        $dd = $Matches[1].PadLeft(2, '0')
        $mm = $Matches[2].PadLeft(2, '0')
        $yyyy = $Matches[3]
        return "$yyyy-$mm-$dd"
    }
    return $s
}

# Simular ResumenCapacitacion exacto para Semana 34
$dailyBajas = @{}
$seenBajas = @{}

$sorted = $asistData | Sort-Object { 
    $p = Parse-Date $_.fecha_registro_asistencia
    [string]$p 
}

foreach ($a in $sorted) {
    $doc = "$($a.documento)".Trim()
    $sigla = "$($a.sigla)".Trim().ToUpper()
    $estado = "$($a.estado)".Trim().ToUpper()
    $motivo = "$($a.motivo_baja)".Trim().ToUpper()
    
    $isBaja = ($sigla -eq 'B' -or $motivo -match 'BAJA' -or $estado -eq 'CESADO' -or $estado -eq 'BAJA' -or $estado -eq 'INACTIVO')

    if ($isBaja -and $doc) {
        if (-not $seenBajas.ContainsKey($doc)) {
            $seenBajas[$doc] = $true
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

Write-Output "--- PUNTOS DE LA CURVA DE DESERCION EN RESUMEN CAPACITACION ---"
$chartPoints | Format-Table -AutoSize
