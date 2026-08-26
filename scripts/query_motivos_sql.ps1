$headers = @{
    Authorization = 'Bearer sbp_b04ec022d3dd31597d39429bf63ae2c334e6e3cc'
    'Content-Type' = 'application/json'
}

$body = @{
    query = "SELECT motivo_baja, COUNT(*) as cantidad FROM consolidado_asistencias WHERE motivo_baja IS NOT NULL AND TRIM(motivo_baja) != '' GROUP BY motivo_baja ORDER BY cantidad DESC;"
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/ujqehcpglfhnytzsyedp/database/query" -Headers $headers -Method POST -Body $body
    Write-Output "--- RESULTADOS DE MOTIVOS_BAJA EN CONSOLIDADO_ASISTENCIAS ---"
    $res | Format-Table -AutoSize
} catch {
    Write-Output "Management API error: $_"
}
