# Gera a narração (voz pt-PT "Helia" do Windows) a partir de src/narracao.json:
# um WAV por fala em public/audio e as durações em src/duracoes.json
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Esperar($operacao, $tipo) {
    $tarefa = $asTask.MakeGenericMethod($tipo).Invoke($null, @($operacao))
    $tarefa.Wait(-1) | Out-Null
    $tarefa.Result
}

$sintetizador = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voz = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'pt-PT' } | Select-Object -First 1
if (-not $voz) { throw 'Não existe nenhuma voz pt-PT instalada no Windows.' }
$sintetizador.Voice = $voz
$sintetizador.Options.SpeakingRate = 0.95

$raiz = $PSScriptRoot
$cenas = Get-Content -Raw -Encoding UTF8 (Join-Path $raiz 'src\narracao.json') | ConvertFrom-Json
$duracoes = [ordered]@{}

foreach ($cena in $cenas) {
    foreach ($fala in $cena.falas) {
        $stream = Esperar ($sintetizador.SynthesizeTextToStreamAsync($fala.texto)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
        $destino = Join-Path $raiz "public\audio\$($fala.id).wav"
        $entrada = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
        $saida = [System.IO.File]::Create($destino)
        $entrada.CopyTo($saida)
        $saida.Close(); $entrada.Close()

        # Duração pelo cabeçalho WAV: tamanho dos dados / bytes por segundo
        $bytes = [System.IO.File]::ReadAllBytes($destino)
        $bytesPorSegundo = [BitConverter]::ToInt32($bytes, 28)
        $i = 12
        while ($i -lt $bytes.Length - 8) {
            $nome = [System.Text.Encoding]::ASCII.GetString($bytes, $i, 4)
            $tamanho = [BitConverter]::ToInt32($bytes, $i + 4)
            if ($nome -eq 'data') { break }
            $i += 8 + $tamanho
        }
        $duracoes[$fala.id] = [math]::Round($tamanho / $bytesPorSegundo, 3)
        Write-Host ("{0,-14} {1,6:N2}s" -f $fala.id, $duracoes[$fala.id])
    }
}

$json = $duracoes | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $raiz 'src\duracoes.json'), $json, (New-Object System.Text.UTF8Encoding $false))
