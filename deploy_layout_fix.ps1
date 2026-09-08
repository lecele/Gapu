# Guapu - Deploy do ajuste de layout (logo maior/clicavel + tela inicial
# centralizada). Gerado pelo Claude em 03/09/2026. Mesmo esquema do deploy do
# Hero Card: reaproveita o script de deploy da VPS com uma lista de arquivos
# diferente. references.ts entra so porque o script da VPS confere a
# presenca dele (checagem fixa da correcao de 02/09) - o conteudo dele nao muda.

$ErrorActionPreference = "Stop"
$projeto = "C:\Users\llece\Documents\DEV\Agentes_na_Saude\Guapu"
$log     = Join-Path $projeto "scratch\deploy-layout-fix.log"
$chave   = "C:\Users\llece\.ssh\agentesnasa_vps_codex_ed25519"
$destino = "vpsadmin@100.103.17.64"
$porta   = "22022"
$stamp   = "20260903-layout"
$staging = "/tmp/guapu-deploy-$stamp"

function Registrar($t) {
  $l = "[$(Get-Date -Format 'HH:mm:ss')] $t"
  Write-Host $l
  Add-Content -Path $log -Value $l -Encoding UTF8
}
function Anotar($t) { Add-Content -Path $log -Value $t -Encoding UTF8 }

Set-Location $projeto
New-Item -ItemType Directory -Force -Path (Join-Path $projeto "scratch") | Out-Null
Set-Content -Path $log -Value "Guapu - deploy layout - $(Get-Date)" -Encoding UTF8

$arquivos = @(
  "app/page.tsx",
  "app/globals.css",
  "lib/chat/references.ts"
)

try {
  Registrar "1) Preparando a pasta de staging na VPS ($staging)"
  $pastas = ($arquivos | ForEach-Object { $d = (Split-Path $_ -Parent).Replace('\','/'); if ($d) { "$staging/$d" } else { $staging } }) | Sort-Object -Unique
  $mkdirCmd = "ssh -o BatchMode=yes -i `"$chave`" -p $porta $destino `"mkdir -p $($pastas -join ' ')`" 2>&1"
  $r = & cmd /c $mkdirCmd; Anotar $r
  if ($LASTEXITCODE -ne 0) { throw "nao foi possivel preparar o staging" }

  Registrar "2) Enviando os arquivos"
  foreach ($a in $arquivos) {
    $local = Join-Path $projeto ($a.Replace('/','\'))
    if (-not (Test-Path $local)) { throw "arquivo local ausente: $a" }
    $scpCmd = "scp -o BatchMode=yes -i `"$chave`" -P $porta `"$local`" `"${destino}:$staging/$a`" 2>&1"
    $r = & cmd /c $scpCmd; Anotar $r
    if ($LASTEXITCODE -ne 0) { throw "falha ao enviar $a" }
    Registrar "   enviado: $a"
  }

  Registrar "3) Executando o deploy na VPS (o build leva alguns minutos)"
  Anotar "---------- saida do servidor ----------"
  $scriptVps = Join-Path $projeto "deploy\ops\deploy_referencias_20260902.sh"
  $sshCmd = "ssh -o BatchMode=yes -i `"$chave`" -p $porta $destino `"GUAPU_DEPLOY_STAMP=$stamp GUAPU_DEPLOY_FILES='$($arquivos -join " ")' bash -s`" 2>&1"
  Get-Content $scriptVps -Raw | & cmd /c $sshCmd |
    ForEach-Object { Write-Host $_; Add-Content -Path $log -Value $_ -Encoding UTF8 }
  $code = $LASTEXITCODE
  Anotar "---------- fim da saida ----------"

  if ($code -ne 0) {
    Registrar "=== DEPLOY INTERROMPIDO (codigo $code) ==="
    Registrar "Volte para a conversa e diga: deploy do layout falhou"
  } else {
    Registrar "=== DEPLOY CONCLUIDO COM SUCESSO ==="
    Registrar "Volte para a conversa e diga: deploy do layout pronto"
  }
}
catch {
  Registrar "=== INTERROMPIDO ANTES DE PUBLICAR ==="
  Registrar $_.Exception.Message
  Registrar "Diga na conversa: deploy do layout falhou"
}
finally {
  Write-Host ""
  Write-Host "Log completo em: $log"
  Write-Host "Pressione Enter para fechar."
  [void](Read-Host)
}
