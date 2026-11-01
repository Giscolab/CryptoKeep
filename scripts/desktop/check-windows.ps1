# Read-only prerequisite checks. No installation, vault or WebView profile access.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows is required for native validation.' }
$missing = [System.Collections.Generic.List[string]]::new()
foreach ($tool in @('node', 'npm', 'rustup')) {
    if (Get-Command $tool -ErrorAction SilentlyContinue) { Write-Host "[OK] $tool available" }
    else { $missing.Add($tool) }
}
if (Get-Command rustup -ErrorAction SilentlyContinue) {
    # `rustup run` checks an installed toolchain; unlike a rustc shim it does
    # not automatically download the project's pinned toolchain.
    & rustup run 1.90.0-x86_64-pc-windows-msvc rustc --version
    if ($LASTEXITCODE -ne 0) { $missing.Add('Rust 1.90.0 x64 MSVC') }
    & rustup run 1.90.0-x86_64-pc-windows-msvc cargo --version
    if ($LASTEXITCODE -ne 0) { $missing.Add('Cargo for Rust 1.90.0 x64 MSVC') }
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path $vswhere) {
    $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($installation) { Write-Host '[OK] MSVC x64 build tools registered' }
    else { $missing.Add('MSVC x64 build tools') }
} else { $missing.Add('Visual Studio Build Tools / vswhere') }
$kits = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows Kits\Installed Roots' -ErrorAction SilentlyContinue
if ($kits -and $kits.KitsRoot10 -and (Test-Path (Join-Path $kits.KitsRoot10 'Include'))) {
    Write-Host '[OK] Windows SDK registered'
} else { $missing.Add('Windows SDK') }
$webview = $false
foreach ($registry in @('HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients', 'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients')) {
    foreach ($client in @(Get-ChildItem $registry -ErrorAction SilentlyContinue)) {
        $metadata = Get-ItemProperty $client.PSPath
        if ($metadata.name -like '*WebView2*' -and $metadata.pv -and $metadata.pv -ne '0.0.0.0') {
            Write-Host "[OK] WebView2 Runtime $($metadata.pv) registered"
            $webview = $true
        }
    }
}
if (-not $webview) { $missing.Add('WebView2 Runtime') }
Write-Host 'Registration checks do not prove native application compatibility.'
if ($missing.Count) { Write-Host ('[MISSING] ' + ($missing -join ', ')); exit 1 }
exit 0
