# Guapu - Deploy do fix de rate limit na ingestao (config.py + rag/ingestion.py)
# Gerado pelo Claude em 03/09/2026.
#
# O worker do Drive (/opt/guapu) roda fora do Docker e e atualizado via
# git pull + restart do systemd (deploy/VPS_WORKER.md) - diferente do app
# Next.js, que usa staging + SCP + docker compose. Por isso este script
# so faz commit/push e depois roda um script remoto que da git pull e
# reinicia o servico guapu-drive-sync-worker.

$ErrorActionPreference = "Stop"
$projeto = "C:\Users\llece\Documents\DEV\Agentes_na_Saude\Guapu"
$log     = Join-Path $projeto "scratch\deploy-ingestion-fix.log"
$chave   = "C:\Users\llece\.ssh\agentesnasa_vps_codex_ed25519"
$destino = "vpsadmin@100.103.17.64"
$porta   = "22022"

function Registrar($t) {
  $l = "[$(Get-Date -Format 'HH:mm:ss')] $t"
  Write-Host $l
  Add-Content -Path $log -Value $l -Encoding UTF8
}

Set-Location $projeto
New-Item -ItemType Directory -Force -Path (Join-Path $projeto "scratch") | Out-Null
Set-Content -Path $log -Value "Guapu - deploy fix ingestao - $(Get-Date)" -Encoding UTF8

try {
  Registrar "1) Commit da correcao (config.py, rag/ingestion.py)"
  $lock = Join-Path $projeto ".git\index.lock"
  if (Test-Path $lock) { Remove-Item $lock -Force }

  & git add -- "config.py" "rag/ingestion.py"
  $staged = & git diff --cached --name-only
  if (-not $staged) {
    Registrar "   nada para commitar (a correcao ja estava commitada?)"
  } else {
    $msg = @"
fix: espacar lotes de embedding e ampliar backoff no 429 do Gemini

Os 3 livros recem-adicionados a biblioteca (Brunner e Suddarth,
Enfermagem em Cardiologia, Morton e Fontaine) falhavam na ingestao
com 429 RESOURCE_EXHAUSTED: os lotes de embedding eram disparados sem
pausa entre si, e o retry existente (3 tentativas, 2-10s) nao dava
tempo da cota por minuto da API do Gemini se recuperar.

- ingestion_batch_delay_seconds (novo, default 1.5s) passa a pausar
  entre lotes nas duas rotinas de ingestao (streaming e nao-streaming).
- _embed_batch passa a tentar 5 vezes com backoff exponencial de 4 a
  60s, focado em sobreviver ao 429 por minuto em vez de desistir em
  poucos segundos.

5 testes de rag/tests/test_ingestion_streaming.py e
test_ingestion_sanitization.py passando, mais 9 outros testes
relacionados a ingestao/sync/config.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G5So2EA5fhGfqwzkBryg4T
"@
    $arqMsg = Join-Path $env:TEMP "guapu-msg-ingestion-fix.txt"
    [System.IO.File]::WriteAllText($arqMsg, $msg, (New-Object System.Text.UTF8Encoding($false)))
    & git commit -F "$arqMsg"
    if ($LASTEXITCODE -ne 0) { throw "commit falhou" }
    Registrar "   commit: ok"
  }

  Registrar "2) Push para o GitHub"
  $branch = & git rev-parse --abbrev-ref HEAD
  & git push origin $branch
  if ($LASTEXITCODE -ne 0) { throw "push falhou" }
  Registrar "   push: ok ($branch)"

  Registrar "3) Publicando na VPS (git pull + restart do worker)"
  Add-Content -Path $log -Value "---------- saida do servidor ----------" -Encoding UTF8
  $scriptVps = Join-Path $projeto "deploy_ingestion_fix_vps.sh"
  # 2>&1 dentro do cmd /c mescla os streams como texto puro ainda no cmd.exe.
  # Fazer isso direto no PowerShell (com $ErrorActionPreference = "Stop")
  # transforma cada linha de stderr do ssh/git em erro terminante e derruba
  # o script no meio - mesmo sendo so aviso/progresso normal.
  $sshCmd = "ssh -o BatchMode=yes -i `"$chave`" -p $porta $destino `"bash -s`" 2>&1"
  Get-Content $scriptVps -Raw | & cmd /c $sshCmd |
    ForEach-Object { Write-Host $_; Add-Content -Path $log -Value $_ -Encoding UTF8 }
  $code = $LASTEXITCODE
  Add-Content -Path $log -Value "---------- fim da saida ----------" -Encoding UTF8

  if ($code -ne 0) {
    Registrar "=== DEPLOY INTERROMPIDO (codigo $code) ==="
    Registrar "Volte para a conversa e diga: deploy do fix de ingestao falhou"
  } else {
    Registrar "=== DEPLOY CONCLUIDO COM SUCESSO ==="
    Registrar "Volte para a conversa e diga: deploy do fix de ingestao pronto"
  }
}
catch {
  Registrar "=== INTERROMPIDO ==="
  Registrar $_.Exception.Message
  Registrar "Diga na conversa: deploy do fix de ingestao falhou"
}
finally {
  Write-Host ""
  Write-Host "Log completo em: $log"
  Write-Host "Pressione Enter para fechar."
  [void](Read-Host)
}
