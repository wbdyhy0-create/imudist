<#
  Gives .imudist files the Imudist icon and the type name "מסמך Imudist" in Windows Explorer.
  Only the current user's settings are changed (HKCU), no administrator rights are needed.

  Run:     powershell -ExecutionPolicy Bypass -File tools\register-filetype.ps1
  Undo:    powershell -ExecutionPolicy Bypass -File tools\register-filetype.ps1 -Remove

  Opening the files by double click is done by installing the app from the browser (see public/manifest.webmanifest);
  this script only takes care of the icon and the name.
#>
param([switch]$Remove)

$ext = 'HKCU:\Software\Classes\.imudist'
$prog = 'HKCU:\Software\Classes\Imudist.Document'
$dest = Join-Path $env:LOCALAPPDATA 'Imudist'

if ($Remove) {
  Remove-Item -Path $ext, $prog -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -Path $dest -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host 'The Imudist file type was removed.'
} else {
  $source = Join-Path $PSScriptRoot '..\public\imudist.ico'
  if (-not (Test-Path $source)) { throw "The icon file was not found: $source (run: python tools/make_icons.py)" }
  # a copy in a fixed place, so the icon keeps working if the project folder is moved
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $icon = Join-Path $dest 'imudist.ico'
  Copy-Item -Path $source -Destination $icon -Force

  New-Item -Path $ext -Force -Value 'Imudist.Document' | Out-Null
  New-Item -Path $prog -Force -Value 'מסמך Imudist' | Out-Null
  New-Item -Path "$prog\DefaultIcon" -Force -Value "`"$icon`",0" | Out-Null
  Write-Host "Done. .imudist files now use the icon $icon"
}

# tell Explorer that file associations changed, so the icons refresh without signing out
Add-Type -Namespace Imudist -Name Shell -MemberDefinition '[System.Runtime.InteropServices.DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, System.IntPtr item1, System.IntPtr item2);'
[Imudist.Shell]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
