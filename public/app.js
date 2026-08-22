const btnEscutar = document.getElementById('btnEscutar');
const btnTocarManual = document.getElementById('btnTocarManual');
const statusEl = document.getElementById('status');
const transcricaoEl = document.getElementById('transcricao');
const resultadoEl = document.getElementById('resultado');
const thumbEl = document.getElementById('thumb');
const tituloVideoEl = document.getElementById('tituloVideo');
const canalVideoEl = document.getElementById('canalVideo');

let ytPlayer = null;
let ytApiPronta = false;
let videoPendente = null;

function setStatus(texto, ehErro = false) {
  statusEl.textContent = texto;
  statusEl.classList.toggle('erro', ehErro);
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
    transcricaoEl.textContent = '';
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
    transcricaoEl.textContent = `"${transcript}"`;
    buscarETocar(transcript);
  });
}

// --- Backend: interpretar pedido + buscar no YouTube ---
async function buscarETocar(transcript) {
  setStatus('Procurando a música...');
  resultadoEl.classList.add('escondido');

  try {
    const resposta = await fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      setStatus(dados.erro || 'Não encontrei essa música.', true);
      return;
    }

    mostrarResultado(dados);
    tocarVideo(dados.video.id);
  } catch (erro) {
    console.error(erro);
    setStatus('Erro ao falar com o servidor.', true);
  }
}

function mostrarResultado(dados) {
  const { video, termoBusca, interpretadoPelaGroq } = dados;
  thumbEl.src = video.thumbnail;
  thumbEl.alt = video.titulo;
  tituloVideoEl.textContent = video.titulo;
  canalVideoEl.textContent = video.canal ? `${video.canal} · ${video.duracao}` : video.duracao;
  resultadoEl.classList.remove('escondido');

  setStatus(
    interpretadoPelaGroq
      ? `Tocando "${termoBusca}"`
      : `Tocando (busca direta): "${termoBusca}"`
  );
}

// --- YouTube IFrame Player ---
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
    tocarVideo(videoPendente);
    videoPendente = null;
  }
};

function tocarVideo(videoId) {
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
          verificarAutoplay(evento.target);
        },
      },
    });
  } else {
    ytPlayer.loadVideoById(videoId);
    verificarAutoplay(ytPlayer);
  }
}

function verificarAutoplay(player) {
  setTimeout(() => {
    const PLAYING = 1;
    if (player.getPlayerState() !== PLAYING) {
      btnTocarManual.classList.remove('escondido');
    }
  }, 1200);
}

btnTocarManual.addEventListener('click', () => {
  if (ytPlayer) {
    ytPlayer.playVideo();
    btnTocarManual.classList.add('escondido');
  }
});

carregarApiYouTube();
