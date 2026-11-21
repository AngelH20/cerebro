# Copia diaria del vault a GitHub (repositorio privado) y lo apunta en el registro de "La IA".
# Requisito: el vault ya es un repositorio git con un remoto privado configurado.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content (Join-Path $root 'hq.config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ([IO.Path]::IsPathRooted($cfg.vault)) { $vault = $cfg.vault } else { $vault = [IO.Path]::GetFullPath((Join-Path $root $cfg.vault)) }

Set-Location $vault
if (-not (Test-Path .git)) { Write-Host "El vault no es un repositorio git. Haz 'git init' y añade un remoto privado primero."; exit 1 }

git add -A
$n = (git diff --cached --name-only | Measure-Object -Line).Lines
if ($n -eq 0) { Write-Host 'Sin cambios.'; exit 0 }
git commit -m "Copia diaria $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-Null
git push
node (Join-Path $root 'scripts/registrar-ia.mjs') --seccion General --agente Script "Copia diaria de HQ en GitHub: $n archivos nuevos o cambiados."
