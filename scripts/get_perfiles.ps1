$token = 'sbp_b04ec022d3dd31597d39429bf63ae2c334e6e3cc'
$projectId = 'lqvvhovfvwzaprdgdobc'
$sql = "SELECT p.id, p.nombre, p.rol, p.cargo, p.telefono, p.formador_documento FROM perfiles p ORDER BY p.rol, p.nombre;"
$body = @{ query = $sql } | ConvertTo-Json
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
$res = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectId/database/query" -Method POST -Headers $headers -Body $body
$res | Format-Table -AutoSize
