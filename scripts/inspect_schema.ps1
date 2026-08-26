$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

# 1. Fetch OpenAPI schema from Supabase PostgREST
$schemaUrl = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/"
$schema = Invoke-RestMethod -Uri $schemaUrl -Headers $headers -Method GET

Write-Output "=========================================================================="
Write-Output "COLUMNAS REALES EN TABLA: perfiles"
Write-Output "=========================================================================="
if ($schema.definitions.perfiles) {
    $schema.definitions.perfiles.properties.PSObject.Properties | Select-Object Name, @{Name="Type"; Expression={$_.Value.type}}, @{Name="Format"; Expression={$_.Value.format}} | Format-Table -AutoSize
} else {
    Write-Output "No se encontró definición de perfiles en OpenAPI. Consultando directamente..."
    $pSample = Invoke-RestMethod -Uri "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/perfiles?select=*&limit=1" -Headers $headers -Method GET
    $pSample[0].PSObject.Properties | Select-Object Name, Value | Format-Table -AutoSize
}

Write-Output ""
Write-Output "=========================================================================="
Write-Output "COLUMNAS REALES EN TABLA: consolidado_asistencias"
Write-Output "=========================================================================="
if ($schema.definitions.consolidado_asistencias) {
    $schema.definitions.consolidado_asistencias.properties.PSObject.Properties | Select-Object Name, @{Name="Type"; Expression={$_.Value.type}}, @{Name="Format"; Expression={$_.Value.format}} | Format-Table -AutoSize
} else {
    Write-Output "No se encontró definición de consolidado_asistencias en OpenAPI. Consultando directamente..."
    $cSample = Invoke-RestMethod -Uri "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/consolidado_asistencias?select=*&limit=1" -Headers $headers -Method GET
    $cSample[0].PSObject.Properties | Select-Object Name, Value | Format-Table -AutoSize
}

Write-Output ""
Write-Output "=========================================================================="
Write-Output "COLUMNAS REALES EN TABLA: capacidad_rys"
Write-Output "=========================================================================="
if ($schema.definitions.capacidad_rys) {
    $schema.definitions.capacidad_rys.properties.PSObject.Properties | Select-Object Name, @{Name="Type"; Expression={$_.Value.type}}, @{Name="Format"; Expression={$_.Value.format}} | Format-Table -AutoSize
} else {
    $capSample = Invoke-RestMethod -Uri "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/capacidad_rys?select=*&limit=1" -Headers $headers -Method GET
    $capSample[0].PSObject.Properties | Select-Object Name, Value | Format-Table -AutoSize
}
