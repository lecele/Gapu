# Guapu - Deploy da v1.7.0 (pacote de prompts entregue pelo cliente em 08/09/2026).
#
# Arquivos:
#   lib/chat/prompts/core.ts   -> Correcao 1: citar autor/obra nao aciona guardrail
#   lib/chat/prompts/modes.ts  -> Correcao 2: Resumo/Quiz/Info encerram no menu curto
#   lib/chat/prompts/flow.ts   -> Correcao 3: envia TENTATIVA_QUIZ ao modelo
#   app/api/chat/route.ts      -> passa quizAttempt adiante (4 chamadas)
#   lib/chat/references.ts     -> so por causa da checagem fixa do script da VPS
#
# Roda o build local antes de publicar e aborta se falhar.

$ErrorActionPreference = "Stop"
$projeto = "C:\Users\llece\Documents\DEV\Agentes_na_Saude\Guapu"
$log     = Join-Path $projeto "scratch\deploy-v170.log"
$chave   = "C:\Users\llece\.ssh\agentesnasa_vps_codex_ed25519"
$destino = "vpsadmin@100.103.17.64"
$porta   = "22022"
$stamp   = "20260908-v170"
$staging = "/tmp/guapu-deploy-$stamp"

function Registrar($t) {
  $l = "[$(Get-Date -Format 'HH:mm:ss')] $t"
  Write-Host $l
  Add-Content -Path $log -Value $l -Encoding UTF8
}
function Anotar($t) { Add-Content -Path $log -Value $t -Encoding UTF8 }

Set-Location $projeto
New-Item -ItemType Directory -Force -Path (Join-Path $projeto "scratch") | Out-Null
Set-Content -Path $log -Value "Guapu - deploy v1.7.0 - $(Get-Date)" -Encoding UTF8

$arquivos = @(
  "lib/chat/prompts/core.ts",
  "lib/chat/prompts/modes.ts",
  "lib/chat/prompts/flow.ts",
  "app/api/chat/route.ts",
  "lib/chat/references.ts"
)

try {
  Registrar "1) Validando com o build local (npm run build)"
  $saidaBuild = & cmd /c "npm run build 2>&1"
  Anotar ($saidaBuild -join "`n")
  if ($LASTEXITCODE -ne 0) {
    $saidaBuild | Select-Object -Last 25 | ForEach-Object { Write-Host $_ }
    throw "o build local falhou - nada foi publicado. Veja o log completo."
  }
  Registrar "   build local OK"

  Registrar "2) Preparando a pasta de staging na VPS ($staging)"
  $pastas = ($arquivos | ForEach-Object { $d = (Split-Path $_ -Parent).Replace('\','/'); if ($d) { "$staging/$d" } else { $staging } }) | Sort-Object -Unique
  $mkdirCmd = "ssh -o BatchMode=yes -i `"$chave`" -p $porta $destino `"mkdir -p $($pastas -join ' ')`" 2>&1"
  $r = & cmd /c $mkdirCmd; Anotar $r
  if ($LASTEXITCODE -ne 0) { throw "nao foi possivel preparar o staging" }

  Registrar "3) Enviando os arquivos"
  foreach ($a in $arquivos) {
    $local = Join-Path $projeto ($a.Replace('/','\'))
    if (-not (Test-Path $local)) { throw "arquivo local ausente: $a" }
    $scpCmd = "scp -o BatchMode=yes -i `"$chave`" -P $porta `"$local`" `"${destino}:$staging/$a`" 2>&1"
    $r = & cmd /c $scpCmd; Anotar $r
    if ($LASTEXITCODE -ne 0) { throw "falha ao enviar $a" }
    Registrar "   enviado: $a"
  }

  Registrar "4) Executando o deploy na VPS (o build leva alguns minutos)"
  Anotar "---------- saida do servidor ----------"
  $scriptVps = Join-Path $projeto "deploy\ops\deploy_referencias_20260902.sh"
  $sshCmd = "ssh -o BatchMode=yes -i `"$chave`" -p $porta $destino `"GUAPU_DEPLOY_STAMP=$stamp GUAPU_DEPLOY_FILES='$($arquivos -join " ")' bash -s`" 2>&1"
  Get-Content $scriptVps -Raw | & cmd /c $sshCmd |
    ForEach-Object { Write-Host $_; Add-Content -Path $log -Value $_ -Encoding UTF8 }
  $code = $LASTEXITCODE
  Anotar "---------- fim da saida ----------"

  if ($code -ne 0) {
    Registrar "=== DEPLOY INTERROMPIDO (codigo $code) ==="
    Registrar "Volte para a conversa e diga: deploy da v1.7.0 falhou"
  } else {
    Registrar "=== DEPLOY CONCLUIDO COM SUCESSO ==="
    Registrar "Volte para a conversa e diga: deploy da v1.7.0 pronto"
  }
}
catch {
  Registrar "=== INTERROMPIDO ANTES DE PUBLICAR ==="
  Registrar $_.Exception.Message
  Registrar "Diga na conversa: deploy da v1.7.0 falhou"
}
finally {
  Write-Host ""
  Write-Host "Log completo em: $log"
  Write-Host "Pressione Enter para fechar."
  [void](Read-Host)
}
