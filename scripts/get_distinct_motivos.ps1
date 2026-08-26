$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

$from = 0
$step = 1000
$allMotivos = @()

while ($true) {
    $cUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?select=motivo_baja,sigla,estado&offset=$from&limit=$step"
    $batch = Invoke-RestMethod -Uri $cUrl -Headers $headers -Method GET
    if ($null -eq $batch -or $batch.Count -eq 0) { break }
    
    foreach ($r in $batch) {
        $m = "$($r.motivo_baja)".Trim()
        $s = "$($r.sigla)".Trim()
        $e = "$($r.estado)".Trim()
        if ($m -or $s -eq 'B' -or $e -eq 'CESADO' -or $e -eq 'BAJA') {
            $allMotivos += [PSCustomObject]@{
                Motivo = if ($m) { $m } else { '(VACÍO / NULL)' }
                Sigla = $s
                Estado = $e
            }
        }
    }
    if ($batch.Count -lt $step) { break }
    $from += $step
}

Write-Output "Total registros con baja/motivo analizados: $($allMotivos.Count)"
Write-Output ""
Write-Output "=========================================================================="
Write-Output "LISTADO COMPLETO DE VALORES EN 'MOTIVO_BAJA' (CONSOLIDADO_ASISTENCIAS)"
Write-Output "=========================================================================="

$grouped = $allMotivos | Group-Object Motivo | Sort-Object Count -Descending | Select-Object @{Name="Motivo"; Expression={$_.Name}}, Count

$grouped | Format-Table -AutoSize
