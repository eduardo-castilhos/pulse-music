const btnEscutar = document.getElementById('btnEscutar');
const btnTocarManual = document.getElementById('btnTocarManual');
const statusEl = document.getElementById('status');
const chatLogEl = document.getElementById('chatLog');
const resultadoEl = document.getElementById('resultado');
const thumbEl = document.getElementById('thumb');
const tituloVideoEl = document.getElementById('tituloVideo');
const canalVideoEl = document.getElementById('canalVideo');
const playerEl = document.getElementById('player');
const audioLocalEl = document.getElementById('audioLocal');
const botoesFonte = document.querySelectorAll('.fonte-btn');
const areaUpload = document.getElementById('areaUpload');
const btnAtualizarBiblioteca = document.getElementById('btnAtualizarBiblioteca');
const listaArquivosEl = document.getElementById('listaArquivos');

const ICONE_MUSICA_LOCAL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2339ff88"><path d="M9 17V5l12-2v12M9 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-4a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" stroke="%2339ff88" stroke-width="1.5" fill="none"/></svg>'
  );

// --- Comandos de controle reconhecidos direto por voz (sem passar pela IA) ---
const COMANDOS = {
  pausar: ['pausa', 'pause', 'pausar', 'para', 'parar', 'para a musica', 'pausa a musica', 'para de tocar', 'para a musica ai'],
  continuar: ['continua', 'continuar', 'retoma', 'resume', 'despausa', 'despausar', 'continua a musica', 'volta a tocar'],
  proxima: ['proxima', 'proxima musica', 'proxima faixa', 'pula', 'pule', 'pula a musica', 'avanca', 'avancar', 'next', 'toca a proxima'],
  anterior: ['anterior', 'musica anterior', 'faixa anterior', 'volta', 'voltar', 'volta a musica anterior', 'musica de antes'],
  repetir: ['repete', 'repetir', 'de novo', 'toca de novo', 'repete essa musica', 'repete a musica', 'toca essa de novo'],
  volumeMais: ['aumenta o volume', 'sobe o volume', 'mais alto', 'aumentar volume', 'sobe o som'],
  volumeMenos: ['diminui o volume', 'abaixa o volume', 'mais baixo', 'diminuir volume', 'abaixa o som'],
  mutar: ['muta', 'mudo', 'sem som', 'silencia', 'tira o som'],
  desmutar: ['desmuta', 'com som', 'ativa o som', 'tira o mudo'],
  tocandoAgora: ['que musica e essa', 'qual e essa musica', 'o que esta tocando', 'que musica esta tocando', 'qual musica e essa'],
};

let ytPlayer = null;
let ytApiPronta = false;
let videoPendente = null;
let fonteAtual = 'youtube';
let bibliotecaLocal = [];
let acaoManualPendente = null;
let historicoChat = [];
let filaAtual = [];
let indiceFila = -1;
let faixaAtualInfo = null;

function setStatus(texto, ehErro = false) {
  statusEl.textContent = texto;
  statusEl.classList.toggle('erro', ehErro);
}

// --- Seletor de fonte: YouTube ou músicas locais ---
botoesFonte.forEach((botao) => {
  botao.addEventListener('click', () => {
    fonteAtual = botao.dataset.fonte;
    botoesFonte.forEach((b) => b.classList.toggle('ativo', b === botao));
    areaUpload.classList.toggle('escondido', fonteAtual !== 'local');

    filaAtual = [];
    indiceFila = -1;
    faixaAtualInfo = null;

    if (fonteAtual === 'local') {
      playerEl.classList.add('escondido');
      if (ytPlayer) ytPlayer.pauseVideo?.();
      carregarBibliotecaDoServidor();
    } else {
      audioLocalEl.classList.add('escondido');
      audioLocalEl.pause();
    }

    btnTocarManual.classList.add('escondido');
    setStatus('');
  });
});

btnAtualizarBiblioteca.addEventListener('click', carregarBibliotecaDoServidor);

async function carregarBibliotecaDoServidor() {
  listaArquivosEl.textContent = 'Procurando músicas na pasta "musics"...';
  try {
    const resposta = await fetch('/api/biblioteca');
    const dados = await resposta.json();
    bibliotecaLocal = dados.faixas || [];
    atualizarListaArquivos();
  } catch (erro) {
    console.error(erro);
    listaArquivosEl.textContent = 'Não consegui ler a pasta "musics" no servidor.';
  }
}

function atualizarListaArquivos() {
  if (bibliotecaLocal.length === 0) {
    listaArquivosEl.textContent = 'Nenhuma música encontrada na pasta "musics". Coloque arquivos de áudio lá dentro (ex: musics/megafunk) e clique em atualizar.';
    return;
  }
  const nomes = bibliotecaLocal.map((faixa) => faixa.nome);
  const resumo = nomes.length > 4 ? `${nomes.slice(0, 4).join(', ')} e mais ${nomes.length - 4}` : nomes.join(', ');
  listaArquivosEl.textContent = `${bibliotecaLocal.length} música(s): ${resumo}`;
}

// --- Reconhecimento de voz (Web Speech API) ---
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognitionAPI) {
  setStatus('Este navegador não suporta reconhecimento de voz. Tente no Chrome ou Safari.', true);
  btnEscutar.disabled = true;
} else {
  const reconhecimento = new SpeechRecognitionAPI();
  reconhecimento.lang = 'pt-BR';
  reconhecimento.continuous = false;
  reconhecimento.interimResults = false;
  reconhecimento.maxAlternatives = 1;

  btnEscutar.addEventListener('click', () => {
    btnTocarManual.classList.add('escondido');
    try {
      reconhecimento.start();
    } catch (erro) {
      // start() lança erro se já estiver escutando; ignoramos.
    }
  });

  reconhecimento.addEventListener('start', () => {
    btnEscutar.classList.add('ouvindo');
    setStatus('Ouvindo... fale o nome da música');
  });

  reconhecimento.addEventListener('end', () => {
    btnEscutar.classList.remove('ouvindo');
  });

  reconhecimento.addEventListener('error', (evento) => {
    btnEscutar.classList.remove('ouvindo');
    setStatus(`Não consegui ouvir (${evento.error}). Tente de novo.`, true);
  });

  reconhecimento.addEventListener('result', (evento) => {
    const transcript = evento.results[0][0].transcript;

    if (tratarComandoDeControle(transcript)) return;

    if (fonteAtual === 'local') {
      tocarDaBiblioteca(transcript);
    } else {
      enviarMensagemChat(transcript);
    }
  });
}

// --- Comandos de controle (pausar, continuar, próxima, anterior, volume...) ---
function tratarComandoDeControle(transcriptOriginal) {
  const alvo = normalizar(transcriptOriginal);

  if (COMANDOS.pausar.includes(alvo)) {
    pausarAtual();
    adicionarBolha('⏸️ Pausado.', 'assistente');
    return true;
  }
  if (COMANDOS.continuar.includes(alvo)) {
    continuarAtual();
    adicionarBolha('▶️ Continuando.', 'assistente');
    return true;
  }
  if (COMANDOS.repetir.includes(alvo)) {
    repetirAtual();
    adicionarBolha('🔁 Repetindo essa música.', 'assistente');
    return true;
  }
  if (COMANDOS.proxima.includes(alvo)) {
    irParaProxima();
    return true;
  }
  if (COMANDOS.anterior.includes(alvo)) {
    irParaAnterior();
    return true;
  }
  if (COMANDOS.volumeMais.includes(alvo)) {
    ajustarVolume(0.15);
    adicionarBolha('🔊 Aumentei o volume.', 'assistente');
    return true;
  }
  if (COMANDOS.volumeMenos.includes(alvo)) {
    ajustarVolume(-0.15);
    adicionarBolha('🔉 Diminuí o volume.', 'assistente');
    return true;
  }
  if (COMANDOS.mutar.includes(alvo)) {
    mutarAtual(true);
    adicionarBolha('🔇 Som desativado.', 'assistente');
    return true;
  }
  if (COMANDOS.desmutar.includes(alvo)) {
    mutarAtual(false);
    adicionarBolha('🔊 Som ativado.', 'assistente');
    return true;
  }
  if (COMANDOS.tocandoAgora.includes(alvo)) {
    adicionarBolha(faixaAtualInfo ? `🎵 Tocando: ${faixaAtualInfo.nome}` : 'Nada tocando no momento.', 'assistente');
    return true;
  }

  return false;
}

function pausarAtual() {
  if (fonteAtual === 'local') audioLocalEl.pause();
  else if (ytPlayer?.pauseVideo) ytPlayer.pauseVideo();
}

function continuarAtual() {
  if (fonteAtual === 'local') audioLocalEl.play().catch(() => {});
  else if (ytPlayer?.playVideo) ytPlayer.playVideo();
}

function repetirAtual() {
  if (fonteAtual === 'local') {
    audioLocalEl.currentTime = 0;
    audioLocalEl.play().catch(() => {});
  } else if (ytPlayer?.seekTo) {
    ytPlayer.seekTo(0, true);
    ytPlayer.playVideo();
  }
}

function ajustarVolume(delta) {
  if (fonteAtual === 'local') {
    audioLocalEl.volume = Math.min(1, Math.max(0, audioLocalEl.volume + delta));
  } else if (ytPlayer?.getVolume) {
    const atual = ytPlayer.getVolume();
    ytPlayer.setVolume(Math.min(100, Math.max(0, atual + delta * 100)));
  }
}

function mutarAtual(mudo) {
  if (fonteAtual === 'local') {
    audioLocalEl.muted = mudo;
  } else if (ytPlayer) {
    mudo ? ytPlayer.mute() : ytPlayer.unMute();
  }
}

// --- Fila de reprodução (alimentada por listas da IA ou pela biblioteca local) ---
function irParaProxima() {
  if (filaAtual.length === 0) {
    adicionarBolha('Não tenho uma lista ativa agora. Peça uma lista de músicas ou toque algo primeiro.', 'assistente');
    return;
  }
  if (indiceFila + 1 >= filaAtual.length) {
    adicionarBolha('Chegou ao fim da lista.', 'assistente');
    return;
  }
  tocarIndiceDaFila(indiceFila + 1);
}

function irParaAnterior() {
  if (filaAtual.length === 0 || indiceFila <= 0) {
    adicionarBolha('Não há música anterior.', 'assistente');
    return;
  }
  tocarIndiceDaFila(indiceFila - 1);
}

function tocarIndiceDaFila(indice) {
  const item = filaAtual[indice];
  if (fonteAtual === 'local') {
    tocarFaixaLocal(item, indice);
  } else {
    enviarMensagemChat(item, { manterFila: true, indiceEscolhido: indice });
  }
}

// --- Modo YouTube: conversa com a Groq (tocar, listar sugestões ou só bater papo) ---
function adicionarBolha(texto, papel) {
  const bolha = document.createElement('div');
  bolha.className = `bolha ${papel}`;
  bolha.textContent = texto;
  chatLogEl.appendChild(bolha);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
  return bolha;
}

function adicionarSugestoes(lista) {
  filaAtual = lista;
  indiceFila = -1;

  const container = document.createElement('div');
  container.className = 'sugestoes';
  lista.forEach((nome, indice) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'sugestao-btn';
    botao.innerHTML = `<span class="numero">${indice + 1}</span><span class="sugestao-nome"></span>`;
    botao.querySelector('.sugestao-nome').textContent = nome;
    botao.addEventListener('click', () => tocarIndiceDaFila(indice));
    container.appendChild(botao);
  });
  chatLogEl.appendChild(container);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

async function enviarMensagemChat(mensagem, opcoes = {}) {
  adicionarBolha(mensagem, 'usuario');
  setStatus('Pensando...');
  resultadoEl.classList.add('escondido');

  try {
    const resposta = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, historico: historicoChat.slice(-10) }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      setStatus(dados.erro || 'Não consegui responder.', true);
      return;
    }

    historicoChat.push({ role: 'user', content: mensagem });
    if (dados.respostaBruta) {
      historicoChat.push({ role: 'assistant', content: dados.respostaBruta });
    }

    if (dados.resposta) {
      adicionarBolha(dados.resposta, 'assistente');
    }
    setStatus('');

    if (dados.acao === 'listar' && Array.isArray(dados.sugestoes)) {
      adicionarSugestoes(dados.sugestoes);
    } else if (dados.acao === 'tocar' && dados.video) {
      mostrarResultadoYoutube(dados);
      tocarVideoYoutube(dados.video.id);
      faixaAtualInfo = { nome: dados.video.titulo };

      if (opcoes.manterFila) {
        indiceFila = opcoes.indiceEscolhido;
      } else {
        filaAtual = [mensagem];
        indiceFila = 0;
      }
    }
  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao falar com o servidor.', true);
  }
}

function mostrarResultadoYoutube(dados) {
  const { video } = dados;
  thumbEl.src = video.thumbnail;
  thumbEl.alt = video.titulo;
  tituloVideoEl.textContent = video.titulo;
  canalVideoEl.textContent = video.canal ? `${video.canal} · ${video.duracao}` : video.duracao;
  resultadoEl.classList.remove('escondido');
}

function carregarApiYouTube() {
  if (window.YT && window.YT.Player) {
    ytApiPronta = true;
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(script);
}

window.onYouTubeIframeAPIReady = function () {
  ytApiPronta = true;
  if (videoPendente) {
    tocarVideoYoutube(videoPendente);
    videoPendente = null;
  }
};

function tocarVideoYoutube(videoId) {
  playerEl.classList.remove('escondido');

  if (!ytApiPronta) {
    videoPendente = videoId;
    carregarApiYouTube();
    return;
  }

  if (!ytPlayer) {
    ytPlayer = new YT.Player('player', {
      videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: (evento) => {
          evento.target.playVideo();
          agendarVerificacaoAutoplay(
            () => ytPlayer.getPlayerState() === 1,
            () => ytPlayer.playVideo()
          );
        },
        onStateChange: (evento) => {
          if (evento.data === YT.PlayerState.ENDED) irParaProxima();
        },
      },
    });
  } else {
    ytPlayer.loadVideoById(videoId);
    agendarVerificacaoAutoplay(
      () => ytPlayer.getPlayerState() === 1,
      () => ytPlayer.playVideo()
    );
  }
}

// --- Modo biblioteca local: casar a fala com um arquivo já carregado ---
function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function encontrarMelhorFaixa(transcript) {
  const alvo = normalizar(transcript);
  const palavras = alvo.split(/\s+/).filter((p) => p.length > 2);

  let melhorFaixa = null;
  let melhorPontuacao = 0;

  for (const faixa of bibliotecaLocal) {
    const nomeNorm = normalizar(faixa.nome);
    if (!nomeNorm) continue;

    let pontuacao = 0;
    if (alvo.includes(nomeNorm)) pontuacao += 5;
    if (nomeNorm.includes(alvo) && alvo) pontuacao += 3;
    for (const palavra of palavras) {
      if (nomeNorm.includes(palavra)) pontuacao += 1;
    }

    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorFaixa = faixa;
    }
  }

  return melhorPontuacao > 0 ? melhorFaixa : null;
}

function tocarFaixaLocal(faixa, indice = null) {
  thumbEl.src = ICONE_MUSICA_LOCAL;
  thumbEl.alt = faixa.nome;
  tituloVideoEl.textContent = faixa.nome;
  canalVideoEl.textContent = 'Da sua biblioteca';
  resultadoEl.classList.remove('escondido');

  audioLocalEl.classList.remove('escondido');
  audioLocalEl.src = faixa.url;
  audioLocalEl.play();
  setStatus(`Tocando "${faixa.nome}"`);
  faixaAtualInfo = { nome: faixa.nome };

  if (indice !== null) {
    filaAtual = bibliotecaLocal;
    indiceFila = indice;
  }

  agendarVerificacaoAutoplay(
    () => !audioLocalEl.paused,
    () => audioLocalEl.play()
  );
}

function tocarDaBiblioteca(transcript) {
  if (bibliotecaLocal.length === 0) {
    setStatus('Você ainda não adicionou nenhuma música. Coloque arquivos em public/musics.', true);
    return;
  }

  const faixa = encontrarMelhorFaixa(transcript);

  if (!faixa) {
    setStatus(`Não encontrei nenhuma música parecida com "${transcript}" na sua biblioteca.`, true);
    return;
  }

  tocarFaixaLocal(faixa, bibliotecaLocal.indexOf(faixa));
}

audioLocalEl.addEventListener('ended', () => irParaProxima());

// --- Fallback comum para quando o navegador bloqueia autoplay ---
function agendarVerificacaoAutoplay(estaTocando, tocarManualmente) {
  setTimeout(() => {
    if (!estaTocando()) {
      acaoManualPendente = tocarManualmente;
      btnTocarManual.classList.remove('escondido');
    }
  }, 1200);
}

btnTocarManual.addEventListener('click', () => {
  if (acaoManualPendente) acaoManualPendente();
  btnTocarManual.classList.add('escondido');
});

carregarApiYouTube();
