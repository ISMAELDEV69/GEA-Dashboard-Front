$url = "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/perfiles?select=id,nombre,rol&order=rol,nombre"
$headers = @{
    apikey = "sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE"
    Authorization = "Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE"
}
$res = Invoke-RestMethod -Uri $url -Headers $headers -Method GET
$res | Format-Table id, nombre, rol -AutoSize
