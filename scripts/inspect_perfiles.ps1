$headers = @{
    apikey = 'sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
    Authorization = 'Bearer sb_publishable_wt_Muu3dmb0GjulWMDYpqg_NKRYqKNE'
}

$pSample = Invoke-RestMethod -Uri "https://ujqehcpglfhnytzsyedp.supabase.co/rest/v1/perfiles?select=*&limit=5" -Headers $headers -Method GET
Write-Output "Perfiles data length: $($pSample.Count)"
if ($pSample.Count -gt 0) {
    $pSample[0].PSObject.Properties | Select-Object Name, Value | Format-Table -AutoSize
}
