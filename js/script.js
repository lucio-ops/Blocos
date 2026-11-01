/**
 * BLOCOS — jogo de tabuleiro estilo Blokus (lógica completa).
 *
 * Este arquivo contém: regras e peças, jogadas da CPU em três níveis, desfazer e dicas,
 * trilhas sonoras geradas pelo navegador (Web Audio API), salvamento no localStorage,
 * telas dinâmicas (menu inicial, tutorial e fim de jogo) e suporte a controle (Gamepad API).
 *
 * Observação sobre a organização: as seções seguem a ordem original das declarações.
 * Essa ordem foi mantida de propósito, pois algumas constantes e variáveis precisam existir
 * antes de serem usadas pelo código que é executado durante o carregamento da página.
 *
 * Convenções de dados usadas em todo o arquivo:
 *  - Jogadores/cores são numerados de 1 a 4 (1 = Azul, 2 = Amarelo, 3 = Vermelho, 4 = Verde).
 *  - O tabuleiro é um vetor de N × N posições (linha * N + coluna); 0 = vazio, 1..4 = dono.
 *  - Cada peça tem um índice de 0 a 20 (em PCS) e várias orientações (girada/espelhada).
 */

/* ==========================================================================
   1. CONFIGURAÇÕES E CONSTANTES
   Tamanho do tabuleiro, cores, nomes, cantos iniciais, vizinhanças e desenho das peças.
   ========================================================================== */

// N = lado do tabuleiro (N × N); COL = cor de cada jogador (índices 1 a 4); NM = nome de cada cor.
const N = 20,
    COL = ['', '#2f6fdb', '#e8b923', '#d94141', '#2fa35b'],
    NM = ['', 'Azul', 'Amarelo', 'Vermelho', 'Verde'];

// START = canto inicial de cada cor; D4 = vizinhos pelos lados; DG = vizinhos pelas diagonais (cantos).
const START = [0, [0, 0], [0, 19], [19, 19], [19, 0]],
    D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]],
    DG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// SH = desenho das 21 peças: 'X' = quadrado, '.' = vazio e '|' = nova linha.
const SH = [
    "X", "XX", "XXX", "X.|XX", "XXXX", "X..|XXX", ".X.|XXX", "XX|XX", ".XX|XX.", ".XX|XX.|.X.",
    "XXXXX", "X...|XXXX", "XX..|.XXX", "XX|XX|X.", "XXX|.X.|.X.", "X.X|XXX", "X..|X..|XXX",
    "X..|XX.|.XX", ".X.|XXX|.X.", ".X..|XXXX", "XX.|.X.|.XX"
];

// Atalho para document.querySelector.
const $ = s => document.querySelector(s);

/* ==========================================================================
   2. PEÇAS: GERAÇÃO DAS ORIENTAÇÕES
   Transforma o desenho de cada peça em todas as formas possíveis (rotações e espelhamentos).
   ========================================================================== */

/**
 * Normaliza um conjunto de células: move a peça para a origem, ordena as células e calcula
 * altura, largura e uma chave de texto que identifica a forma.
 *
 * @param {Array<number[]>} c - Células no formato [linha, coluna].
 * @returns {{cells: Array<number[]>, h: number, w: number, k: string}} Peça normalizada.
 */
function norm(c) {
    const my = Math.min(...c.map(a => a[0])), mx = Math.min(...c.map(a => a[1]));
    const r = c.map(([y, x]) => [y - my, x - mx]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return {
        cells: r,
        h: Math.max(...r.map(a => a[0])) + 1,
        w: Math.max(...r.map(a => a[1])) + 1,
        k: r.join(';')
    };
}

/**
 * Gera todas as orientações distintas de uma peça (4 rotações, com e sem espelhamento),
 * descartando as repetidas por meio da chave "k".
 *
 * @param {Array<number[]>} c - Células da peça original.
 * @returns {Array<Object>} Lista de orientações normalizadas.
 */
function orients(c) {
    const m = new Map();
    for (let f = 0; f < 2; f++) {
        for (let r = 0; r < 4; r++) {
            c = c.map(([y, x]) => [x, -y]);
            const o = norm(c);
            m.set(o.k, o);
        }
        c = c.map(([y, x]) => [y, -x]);
    }
    return [...m.values()];
}

// PCS = as 21 peças: n = nº de quadrados, base = células originais, os = orientações distintas.
const PCS = SH.map(s => {
    const base = [];
    s.split('|').forEach((r, y) => [...r].forEach((ch, x) => {
        if (ch === 'X') base.push([y, x]);
    }));
    return { n: base.length, base, os: orients(base) };
});

/**
 * Devolve a orientação atual da peça i, aplicando o espelhamento (fl) e a rotação (rot) escolhidos.
 *
 * @param {number} i - Índice da peça (0 a 20).
 * @returns {Object} Peça normalizada.
 * Usa as variáveis globais "fl" e "rot".
 */
function getO(i) {
    let c = PCS[i].base;
    if (fl) c = c.map(([y, x]) => [y, -x]);
    for (let k = 0; k < rot; k++) c = c.map(([y, x]) => [x, -y]);
    return norm(c);
}

/* ==========================================================================
   3. ESTADO DA PARTIDA E REFERÊNCIAS AO DOM
   Variáveis principais do jogo e criação das 400 células do tabuleiro.
   ========================================================================== */

// board = células; used = peças já usadas por cor; started = cor já fez a 1ª jogada; done = cor sem lances;
// cur = cor da vez; sel = peça selecionada; rot/fl = rotação/espelhamento da peça selecionada;
// hover = célula sob o ponteiro; over = fim de jogo; humans = nº de humanos;
// gen = contador que invalida jogadas agendadas da CPU quando uma nova partida começa.
let board, used, started, done, cur, sel, rot, fl, hover, over, humans, gen = 0;
// cells = as 400 divs do tabuleiro (preenchidas abaixo); B = contêiner #board.
const cells = [];
const B = $('#board');

// Cria as 400 células do tabuleiro e liga os eventos de mouse (passar o ponteiro e clicar).
for (let i = 0; i < N * N; i++) {
    const d = document.createElement('div');
    d.onmouseover = () => {
        hover = i;
        paint();
    };
    d.onclick = () => {
        hover = i;
        click();
    };
    B.appendChild(d);
    cells.push(d);
}

B.onmouseleave = () => {
    hover = null;
    paint();
};

/* ==========================================================================
   4. ESTADO DA INTERFACE E REGRAS DO JOGO
   Opções de interface, validação de jogadas e levantamento dos lances possíveis.
   ========================================================================== */

// HS = cores controladas por humanos; mc = cor escolhida no menu; snaps = histórico para "Desfazer";
// lp = células da última peça colocada; drag = arrastando uma peça; dif = dificuldade da CPU;
// sym = modo com símbolos; showC = mostrar cantos disponíveis; bc = cache de cantos dos adversários (CPU).
let HS = [1],
    mc = 1,
    snaps = [],
    lp = [],
    drag = false,
    dif = 'medio',
    sym = false,
    showC = true,
    bc = null;

// Símbolos de cada cor (auxílio para quem não distingue bem as cores).
const SY = ['', '●', '■', '▲', '◆'];
// Verdadeiro se a cor p é controlada por um humano.
const isH = p => HS.includes(p);

/**
 * Destaca, na tela inicial, o botão da cor escolhida (mc).
 *
 * Efeito colateral: altera classes CSS dos botões ".sw".
 */
function swp() {
    document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', +b.dataset.c === mc));
}

/**
 * Verifica se uma peça pode ser colocada numa posição, segundo as regras do Blokus.
 *
 * @param {number} p - Cor do jogador (1 a 4).
 * @param {Object} o - Orientação da peça (cells, h, w).
 * @param {number} r - Linha do canto superior esquerdo.
 * @param {number} c - Coluna do canto superior esquerdo.
 * @returns {boolean} true se a jogada é permitida.
 */
function valid(p, o, r, c) {
    // 1) A peça precisa caber inteiramente dentro do tabuleiro.
    if (r < 0 || c < 0 || r + o.h > N || c + o.w > N) return false;
    let cor = false;
    // 2) Confere cada quadrado: célula livre, sem contato lateral com a própria cor.
    for (const [y, x] of o.cells) {
        const Y = y + r, X = x + c;
        if (board[Y * N + X]) return false;
        for (const [dy, dx] of D4) {
            const a = Y + dy, b = X + dx;
            if (a >= 0 && b >= 0 && a < N && b < N && board[a * N + b] === p) return false;
        }
        // 3) Depois da 1ª jogada, exige contato pelo canto com a própria cor; na 1ª, exige cobrir o canto inicial.
        if (started[p]) {
            for (const [dy, dx] of DG) {
                const a = Y + dy, b = X + dx;
                if (a >= 0 && b >= 0 && a < N && b < N && board[a * N + b] === p) cor = true;
            }
        } else if (Y === START[p][0] && X === START[p][1]) cor = true;
    }
    return cor;
}

/**
 * Lista todas as jogadas possíveis de um jogador (peça, orientação e posição).
 *
 * @param {number} p - Cor do jogador.
 * @param {boolean} [one] - Se verdadeiro, para no primeiro lance válido (apenas verifica se há lance).
 * @returns {Array<{i: number, o: Object, r: number, c: number}>} Lances encontrados.
 */
function moves(p, one) {
    const out = [];
    // Percorre peças não usadas, orientações e posições possíveis.
    for (let i = 0; i < 21; i++) {
        if (used[p].has(i)) continue;
        for (const o of PCS[i].os) for (let r = 0; r <= N - o.h; r++) for (let c = 0; c <= N - o.w; c++) if (valid(p, o, r, c)) {
            out.push({ i, o, r, c });
            if (one) return out;
        }
    }
    return out;
}

// Quantidade de quadrados que a cor p ainda não colocou no tabuleiro.
const rem = p => PCS.reduce((s, q, i) => s + (used[p].has(i) ? 0 : q.n), 0);

/**
 * Converte a célula sob o ponteiro (hover) na posição do canto superior esquerdo da peça, centralizando-a.
 *
 * @param {Object} o - Orientação da peça.
 * @returns {number[]} Par [linha, coluna].
 */
function anchor(o) {
    // Centraliza a peça na célula apontada.
    const r = Math.floor(hover / N) - Math.floor(o.h / 2), c = hover % N - Math.floor(o.w / 2);
    return [r, c];
}

/**
 * Tenta colocar a peça selecionada na posição apontada; se for inválida, toca o som de erro.
 *
 * Só age na vez de um humano, com peça selecionada e ponteiro sobre o tabuleiro.
 */
function click() {
    if (over || sel === null || hover === null || !isH(cur)) return;
    const o = getO(sel), [r, c] = anchor(o);
    if (valid(cur, o, r, c)) place(cur, sel, o, r, c);
    else bad();
}

/* ==========================================================================
   5. ÁUDIO: EFEITOS SONOROS E TRILHAS
   Sons de jogo e músicas estilo arcade geradas pela Web Audio API (sem arquivos externos).
   ========================================================================== */

// AC = contexto de áudio; MG = volume da música; FG = volume dos efeitos (vm/vf = níveis; mute = mudo);
// mus = trilha atual; ms = passo atual; nt = tempo da próxima nota; mtm = temporizador do agendador.
let AC, MG, FG, vm = 1, vf = 1, mute = false, mus = null, ms = 0, nt = 0, mtm = null;

/**
 * Aplica os volumes de música e de efeitos (ou silêncio, se estiver mudo).
 */
function gv() {
    if (MG) {
        MG.gain.value = mute ? 0 : vm;
        FG.gain.value = mute ? 0 : vf;
    }
}

/**
 * Obtém o contexto de áudio, criando-o (e os controles de volume) na primeira chamada e reativando-o se estiver suspenso.
 *
 * @returns {AudioContext} Contexto de áudio.
 */
function ac() {
    // Cria o contexto e os controles de volume apenas uma vez.
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (!MG) {
        MG = AC.createGain();
        FG = AC.createGain();
        MG.connect(AC.destination);
        FG.connect(AC.destination);
        gv();
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
}

// TR = trilhas. bpm = andamento; w = tipo de onda da melodia; v = volume; r = notas-base dos 4 compassos;
// l = melodia em 32 passos (0 = pausa); dr = com bateria; bs = estilo do baixo; n = nome da trilha.
const TR = {
    menu: {
        bpm: 150,
        w: 'square',
        v: .06,
        r: [48, 41, 43, 48],
        l: [
            72, 76, 79, 76, 72, 76, 79, 81,
            77, 81, 84, 81, 77, 81, 84, 86,
            79, 83, 86, 83, 79, 83, 86, 88,
            84, 83, 81, 79, 77, 76, 74, 72
        ]
    },
    game: {
        bpm: 116,
        w: 'square',
        v: .035,
        r: [45, 41, 43, 40],
        l: [
            69, 0, 72, 0, 76, 0, 72, 0,
            65, 0, 69, 0, 72, 0, 69, 0,
            67, 0, 71, 0, 74, 0, 71, 0,
            64, 0, 68, 0, 71, 68, 64, 0
        ]
    },
    end: {
        bpm: 132,
        w: 'square',
        v: .065,
        r: [48, 41, 43, 48],
        l: [
            72, 76, 79, 84, 0, 79, 84, 0,
            77, 81, 84, 89, 0, 84, 89, 0,
            79, 83, 86, 91, 0, 86, 91, 0,
            84, 0, 79, 0, 76, 0, 72, 0
        ]
    }
};

// Nomes das trilhas originais.
TR.menu.n = 'Neon Arcade';
TR.game.n = 'Foco';
TR.end.n = 'Vitória';

// Trilhas adicionais (menu2, menu3, game2..4, end2, end3).
Object.assign(TR, {
    menu2: {
        n: 'Pixel Parade',
        bpm: 160,
        w: 'square',
        v: .055,
        dr: 1,
        r: [43, 48, 50, 43],
        l: [
            79, 0, 83, 86, 83, 0, 79, 0,
            84, 0, 88, 91, 88, 0, 84, 0,
            86, 0, 90, 93, 90, 0, 86, 0,
            91, 88, 86, 83, 79, 0, 0, 0
        ]
    },
    menu3: {
        n: 'Turbo Start',
        bpm: 168,
        w: 'sawtooth',
        v: .04,
        dr: 1,
        bs: 1,
        r: [45, 41, 48, 43],
        l: [
            81, 0, 76, 81, 84, 0, 81, 76,
            77, 0, 72, 77, 81, 0, 77, 72,
            79, 0, 76, 79, 84, 0, 79, 76,
            79, 0, 74, 79, 83, 0, 86, 0
        ]
    },
    game2: {
        n: 'Labirinto',
        bpm: 124,
        w: 'triangle',
        v: .07,
        dr: 1,
        r: [38, 34, 36, 33],
        l: [
            74, 0, 77, 0, 81, 0, 77, 74,
            70, 0, 74, 0, 77, 0, 74, 70,
            72, 0, 76, 0, 79, 0, 76, 72,
            69, 0, 73, 0, 76, 73, 69, 0
        ]
    },
    game3: {
        n: 'Estratégia',
        bpm: 108,
        w: 'sine',
        v: .08,
        r: [43, 40, 48, 50],
        l: [
            79, 0, 83, 0, 86, 0, 83, 0,
            76, 0, 79, 0, 83, 0, 79, 0,
            72, 0, 76, 0, 79, 0, 76, 0,
            74, 0, 78, 0, 81, 78, 74, 0
        ]
    },
    game4: {
        n: 'Corrida',
        bpm: 138,
        w: 'square',
        v: .03,
        dr: 1,
        bs: 1,
        r: [40, 48, 43, 47],
        l: [
            76, 76, 0, 79, 0, 83, 79, 0,
            72, 72, 0, 76, 0, 79, 76, 0,
            79, 79, 0, 83, 0, 86, 83, 0,
            78, 78, 0, 83, 0, 86, 83, 0
        ]
    },
    end2: {
        n: 'Troféu',
        bpm: 126,
        w: 'square',
        v: .06,
        dr: 1,
        r: [43, 48, 50, 43],
        l: [
            79, 83, 86, 91, 0, 86, 91, 0,
            84, 88, 91, 96, 0, 91, 96, 0,
            86, 90, 93, 98, 0, 93, 98, 0,
            91, 0, 86, 0, 83, 0, 79, 0
        ]
    },
    end3: {
        n: 'Replay',
        bpm: 96,
        w: 'triangle',
        v: .09,
        r: [45, 41, 43, 40],
        l: [
            69, 0, 72, 0, 76, 0, 0, 0,
            65, 0, 69, 0, 72, 0, 0, 0,
            67, 0, 71, 0, 74, 0, 0, 0,
            64, 0, 68, 0, 71, 0, 0, 0
        ]
    }
});

// Trilhas agrupadas por tela (menu, partida e fim de jogo).
const CAT = {
    menu: ['menu', 'menu2', 'menu3'],
    game: ['game', 'game2', 'game3', 'game4'],
    end: ['end', 'end2', 'end3']
};

// mcat = tela cuja música toca; pref = trilha escolhida pelo usuário (ou "auto"); lastT = última sorteada; NB = ruído da bateria.
let mcat = null, pref = { menu: 'auto', game: 'auto', end: 'auto' }, lastT = {}, NB = null;

/**
 * Escolhe a trilha de uma tela: a preferida pelo usuário ou uma sorteada diferente da última.
 *
 * @param {string} c - Tela: "menu", "game" ou "end".
 * @returns {string} Identificador da trilha escolhida.
 */
function pick(c) {
    const l = CAT[c];
    if (pref[c] !== 'auto' && TR[pref[c]]) return pref[c];
    let t;
    do {
        t = l[Math.floor(Math.random() * l.length)];
    } while (t === lastT[c] && l.length > 1);
    return lastT[c] = t;
}

/**
 * Toca a bateria de um passo da música: bumbo, chimbal e caixa, feitos com oscilador e ruído.
 *
 * @param {number} i - Passo (0 a 31).
 * @param {number} t - Instante de execução (relógio do áudio).
 * @param {number} d - Duração do passo (reservado; não é usado).
 * @param {number} v - Volume base da trilha.
 */
function perc(i, t, d, v) {
    // Bumbo: a cada 4 passos, com tom que cai rapidamente.
    if (i % 4 === 0) {
        const o = AC.createOscillator(), g = AC.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + .12);
        g.gain.setValueAtTime(v * 4, t);
        g.gain.exponentialRampToValueAtTime(.0001, t + .14);
        o.connect(g);
        g.connect(MG);
        o.start(t);
        o.stop(t + .15);
    }
    // Chimbal (passos ímpares) e caixa (passo 4 de cada 8), feitos com ruído filtrado.
    if (i % 2 === 1 || i % 8 === 4) {
        if (!NB) {
            NB = AC.createBuffer(1, AC.sampleRate * .2, AC.sampleRate);
            const a = NB.getChannelData(0);
            for (let k = 0; k < a.length; k++) a[k] = Math.random() * 2 - 1;
        }
        const sn = i % 8 === 4,
            s = AC.createBufferSource(),
            f = AC.createBiquadFilter(),
            g = AC.createGain();
        s.buffer = NB;
        f.type = 'highpass';
        f.frequency.value = sn ? 1500 : 6000;
        g.gain.setValueAtTime(v * (sn ? 3 : 1.2), t);
        g.gain.exponentialRampToValueAtTime(.0001, t + (sn ? .12 : .04));
        s.connect(f);
        f.connect(g);
        g.connect(MG);
        s.start(t);
        s.stop(t + .15);
    }
}

/**
 * Cria o botão ♪ e o painel onde o jogador escolhe a trilha de cada tela.
 *
 * Efeito colateral: adiciona elementos ao body.
 */
function mkTrk() {
    const b = document.createElement('button');
    b.id = 'trk';
    b.title = 'Trilhas';
    b.textContent = '♪';
    b.onclick = () => {
        const q = $('#gpp');
        if (q) q.style.display = 'none';
        p.style.display = p.style.display === 'none' ? '' : 'none';
    };
    const p = document.createElement('div');
    p.id = 'trkp';
    p.className = 'card';
    p.style.display = 'none';
    p.innerHTML = [['menu', 'Menu inicial'], ['game', 'Partida'], ['end', 'Tela final']].map(([c, t]) => `<label>${t}<select data-c='${c}'><option value='auto'>Automática (variada)</option>${CAT[c].map(id=>`<option value='${id}'>${TR[id].n}</option>`).join('')}</select></label>`).join('');
    p.querySelectorAll('select').forEach(s => {
        s.value = pref[s.dataset.c];
        s.onchange = () => {
            pref[s.dataset.c] = s.value;
            if (mcat === s.dataset.c) {
                mus = pick(mcat);
                ms = 0;
                nt = AC ? AC.currentTime + .05 : 0;
            }
            sset();
        };
    });
    document.body.append(b, p);
}

/**
 * Toca uma nota com envelope de volume decrescente.
 *
 * @param {number} m - Nota MIDI (69 = lá de 440 Hz).
 * @param {number} t - Instante de início.
 * @param {number} d - Duração em segundos.
 * @param {string} type - Forma de onda.
 * @param {number} v - Volume.
 */
function note(m, t, d, type, v) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g);
    g.connect(MG);
    o.start(t);
    o.stop(t + d + .02);
}

/**
 * Agenda as notas da trilha atual um pouco à frente do relógio (executada a cada 80 ms).
 */
function sched() {
    if (!AC || !mus) return;
    // Agenda as notas dos próximos 0,3 s ("look-ahead").
    while (nt < AC.currentTime + .3) {
        const T = TR[mus], d = 60 / T.bpm / 2, i = ms % 32, m = T.l[i];
        if (m) note(m, nt, d * .9, T.w, T.v);
        // Baixo: a cada 2 passos, alternando fundamental e quinta (ou oitava).
        if (i % 2 === 0) {
            const r = T.r[i >> 3], ps = i % 8;
            let bn = ps < 4 ? r : r + 7;
            if (T.bs === 1) bn = ps % 4 < 2 ? r : r + 12;
            note(bn, nt, d * 1.8, 'triangle', T.v * 1.6);
        }
        // Bateria, nas trilhas que a possuem.
        if (T.dr) perc(i, nt, d, T.v);
        nt += d;
        ms++;
        // A cada 6 repetições da melodia, sorteia outra trilha (modo automático).
        if (ms % 192 === 0 && pref[mcat] === 'auto') mus = pick(mcat);
    }
}

/**
 * Inicia a música de uma tela (ou interrompe, se c for nulo). Não faz nada se ela já estiver tocando.
 *
 * @param {string|null} c - "menu", "game", "end" ou null.
 */
function music(c) {
    if (mcat === c) return;
    mcat = c;
    ms = 0;
    clearInterval(mtm);
    if (!c) {
        mus = null;
        return;
    }
    ac();
    mus = pick(c);
    nt = AC.currentTime + .05;
    sched();
    mtm = setInterval(sched, 80);
}

/**
 * Cria o botão que silencia ou reativa todo o som.
 */
function mkMute() {
    const b = document.createElement('button');
    b.id = 'mute';
    b.title = 'Som';
    b.textContent = mute ? '🔇' : '🔊';
    b.onclick = () => {
        mute = !mute;
        gv();
        sset();
        b.textContent = mute ? '🔇' : '🔊';
        ac();
    };
    document.body.appendChild(b);
}

// Alguns navegadores suspendem o áudio até a primeira interação: reativa-o ao tocar numa tecla ou na tela.
addEventListener('pointerdown', () => {
    if (AC && AC.state === 'suspended') AC.resume();
});

addEventListener('keydown', () => {
    if (AC && AC.state === 'suspended') AC.resume();
});

/**
 * Toca o som de jogada inválida.
 */
function bad() {
    try {
        ac();
        const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(160, t);
        o.frequency.linearRampToValueAtTime(90, t + .15);
        g.gain.setValueAtTime(.08, t);
        g.gain.exponentialRampToValueAtTime(.001, t + .18);
        o.connect(g);
        g.connect(FG);
        o.start(t);
        o.stop(t + .2);
    } catch (e) {}
}

/**
 * Toca o clique de encaixe de uma peça.
 */
function snd() {
    try {
        ac();
        const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(300, t + .05);
        g.gain.setValueAtTime(.12, t);
        g.gain.exponentialRampToValueAtTime(.001, t + .07);
        o.connect(g);
        g.connect(FG);
        o.start(t);
        o.stop(t + .08);
    } catch (e) {}
}

/* ==========================================================================
   6. FLUXO DA PARTIDA
   Execução de jogadas, passagem de turno, avisos e jogadas da CPU.
   ========================================================================== */

/**
 * Executa uma jogada: guarda o estado para "Desfazer", marca a peça no tabuleiro e passa a vez.
 *
 * @param {number} p - Cor do jogador.
 * @param {number} i - Índice da peça.
 * @param {Object} o - Orientação usada.
 * @param {number} r - Linha do canto superior esquerdo.
 * @param {number} c - Coluna do canto superior esquerdo.
 */
function place(p, i, o, r, c) {
    // Guarda o estado anterior para o "Desfazer".
    snaps.push({
        b: board.slice(),
        u: used.map(s => s ? new Set(s) : 0),
        s: started.slice(),
        d: done.slice(),
        l: last.slice(),
        c: cur,
        lp: lp
    });
    // Registra as células da peça (para destaque e animação).
    lp = o.cells.map(([y, x]) => (y + r) * N + x + c);
    snd();
    last[p] = i;
    for (const [y, x] of o.cells) board[(y + r) * N + x + c] = p;
    used[p].add(i);
    started[p] = 1;
    sel = null;
    advance();
}

/**
 * Passa a vez ao próximo jogador que ainda tenha lances; quem não tiver é marcado como "done". Se ninguém puder jogar, encerra a partida.
 *
 * Salva a partida, redesenha a tela e agenda a CPU, se for a vez dela.
 */
function advance() {
    let found = false;
    // Procura o próximo jogador, na ordem das cores, que ainda tenha lance; quem não tem passa a vez.
    for (let k = 1; k <= 4; k++) {
        const p = (cur - 1 + k) % 4 + 1;
        if (done[p]) continue;
        if (moves(p, true).length) {
            cur = p;
            found = true;
            break;
        }
        done[p] = 1;
        aviso(p);
    }
    // Ninguém mais pode jogar: fim da partida.
    if (!found) over = true;
    sv();
    paint();
    ui();
    ai();
}

// tt = temporizador do aviso temporário (toast), compartilhado por aviso() e tst().
let tt;

/**
 * Exibe um aviso temporário de que uma cor não tem mais lances e passa a vez.
 *
 * @param {number} p - Cor do jogador.
 */
function aviso(p) {
    let t = $('#toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        document.body.appendChild(t);
    }
    t.innerHTML = `<span style="color:${COL[p]}">●</span> ${NM[p]} não tem mais lances e passa a vez.`;
    t.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('on'), 3500);
}

/**
 * Faz a CPU jogar (após 0,4 s) escolhendo o lance de maior pontuação segundo a dificuldade.
 */
function ai() {
    if (over || isH(cur)) return;
    const g = gen;
    // A CPU "pensa" por 0,4 s; "g" cancela a jogada se uma nova partida começar nesse intervalo.
    setTimeout(() => {
        if (g !== gen || over) return;
        const p = cur, ms = moves(p);
        let best = null, bs = -1;
        bc = null;
        for (const m of ms) {
            const s = evalM(p, m);
            if (s > bs) {
                bs = s;
                best = m;
            }
        }
        if (!best) {
            done[p] = 1;
            advance();
            return;
        }
        place(p, best.i, best.o, best.r, best.c);
    }, 400);
}

/* ==========================================================================
   7. INTERFACE: TABULEIRO, PLACAR E BANDEJA
   Desenho do tabuleiro, do placar, da mensagem de status e das peças disponíveis.
   ========================================================================== */

/**
 * Redesenha o tabuleiro: peças, destaque da última jogada, símbolos, cantos disponíveis e prévia da peça.
 */
function paint() {
    for (let i = 0; i < N * N; i++) {
        const d = cells[i], v = board[i];
        d.style.opacity = 1;
        d.style.boxShadow = v ? (lp.includes(i) ? 'inset 0 0 0 3px rgba(255,255,255,.8),inset 0 -3px 0 rgba(0,0,0,.2)' : 'inset 0 0 0 2px rgba(255,255,255,.3),inset 0 -3px 0 rgba(0,0,0,.2)') : 'none';
        d.style.background = v ? COL[v] : '';
        d.dataset.s = sym && v ? SY[v] : '';
        d.classList.toggle('pop', !!v && lp.includes(i));
        if (!v) for (let p = 1; p <= 4; p++) if (!started[p] && START[p][0] * N + START[p][1] === i) d.style.boxShadow = 'inset 0 0 0 3px ' + COL[p];
    }
    // Pontos nos cantos onde a próxima peça pode encostar.
    if (!over && showC && isH(cur)) for (const k of corners(cur)) cells[k].style.background = `radial-gradient(circle,${COL[cur]} 0 20%,transparent 24%),var(--cell)`;
    // Prévia da peça: colorida se válida, cinza se inválida.
    if (!over && hover !== null && sel !== null && isH(cur)) {
        const o = getO(sel), [r, c] = anchor(o), ok = valid(cur, o, r, c);
        for (const [y, x] of o.cells) {
            const Y = y + r, X = x + c;
            if (Y < 0 || X < 0 || Y >= N || X >= N) continue;
            const d = cells[Y * N + X];
            d.style.background = ok ? COL[cur] : '#888';
            d.style.opacity = ok ? .75 : .5;
        }
    }
}

/**
 * Atualiza o placar, a mensagem de status e a bandeja de peças do jogador da vez; no fim do jogo, abre a tela final.
 */
function ui() {
    $('#score').innerHTML = [1, 2, 3, 4].map(p => `<div class="sc ${cur===p&&!over?'on':''} ${done[p]?'out':''}" style="color:${COL[p]}">${sym?SY[p]+' ':''}${NM[p]}<b>${rem(p)}</b><span style="color:var(--mt)">${isH(p)?'humano':'CPU'}</span></div>`).join('');
    const st = $('#status'), tr = $('#tray');
    tr.innerHTML = '';
    // Fim de jogo: mostra o resultado e abre a tela final.
    if (over) {
        showEnd();
        const r = [1, 2, 3, 4].map(rem),
            m = Math.min(...r),
            w = [1, 2, 3, 4].filter(p => r[p - 1] === m).map(p => NM[p]);
        st.textContent = 'Fim de jogo — ' + (w.length > 1 ? 'empate entre ' + w.join(' e ') : 'vence o ' + w[0]) + ' (restam ' + m + ' quadrados).';
        return;
    }
    st.innerHTML = `Vez do <span style="color:${COL[cur]}">${NM[cur]}</span>` + (isH(cur) ? '' : ' (CPU pensando…)');
    if (!isH(cur)) return;
    // Bandeja: desenha cada peça ainda disponível do jogador da vez.
    for (let i = 0; i < 21; i++) {
        if (used[cur].has(i)) continue;
        const o = i === sel ? getO(i) : norm(PCS[i].base);
        const b = document.createElement('div');
        b.className = 'pc' + (i === sel ? ' sel' : '');
        b.style.gridTemplateColumns = `repeat(${o.w},11px)`;
        const set = new Set(o.cells.map(a => a[0] * o.w + a[1]));
        for (let k = 0; k < o.h * o.w; k++) {
            const e = document.createElement('i');
            if (set.has(k)) {
                e.style.background = COL[cur];
                if (sym) e.dataset.s = SY[cur];
            }
            b.appendChild(e);
        }
        b.tabIndex = 0;
        b.onpointerdown = e => {
            if (sel !== i) {
                rot = 0;
                fl = 0;
            }
            sel = i;
            drag = true;
            document.querySelectorAll('.pc').forEach(x => x.classList.remove('sel'));
            b.classList.add('sel');
        };
        b.onkeydown = e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (sel !== i) {
                    rot = 0;
                    fl = 0;
                }
                sel = i;
                ui();
                paint();
            }
        };
        tr.appendChild(b);
    }
}

/**
 * Gira e/ou espelha a peça selecionada.
 *
 * @param {number} a - Se verdadeiro, gira 90°.
 * @param {number} b - Se verdadeiro, espelha.
 */
function tf(a, b) {
    if (sel === null) return;
    if (a) rot = (rot + 1) % 4;
    if (b) fl ^= 1;
    ui();
    paint();
}

/* ==========================================================================
   8. EVENTOS DA INTERFACE
   Botões do painel, arrastar e soltar (mouse e toque) e atalhos de teclado.
   ========================================================================== */

// Botões do painel lateral.
$('#rot').onclick = () => tf(1, 0);
$('#flip').onclick = () => tf(0, 1);
$('#hint').onclick = hint;
$('#undo').onclick = undo;

$('#cor').onclick = () => {
    showC = !showC;
    btns();
    sset();
    paint();
};

$('#sym').onclick = () => {
    sym = !sym;
    btns();
    sset();
    paint();
    ui();
};

$('#vm').oninput = e => {
    vm = e.target.value / 100;
    gv();
    sset();
};

$('#vf').oninput = e => {
    vf = e.target.value / 100;
    gv();
    sset();
};

// Arrastar e soltar: acompanha o ponteiro, mostra a prévia e, ao soltar sobre o tabuleiro, tenta encaixar.
addEventListener('pointermove', e => {
    if (!drag) return;
    const k = cells.indexOf(document.elementFromPoint(e.clientX, e.clientY));
    if (k >= 0 && k !== hover) {
        hover = k;
        paint();
    }
});

addEventListener('pointerup', e => {
    if (!drag) return;
    drag = false;
    const k = cells.indexOf(document.elementFromPoint(e.clientX, e.clientY));
    if (k >= 0 && sel !== null) {
        hover = k;
        click();
    }
    ui();
    paint();
});

addEventListener('pointercancel', () => {
    drag = false;
});

// Atalhos: R gira, F espelha, setas movem a peça, Enter/Espaço confirma e Esc cancela.
addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'r') tf(1, 0);
    if (k === 'f') tf(0, 1);
    const mv = { arrowup: [-1, 0], arrowdown: [1, 0], arrowleft: [0, -1], arrowright: [0, 1] }[k];
    if (mv && sel !== null && isH(cur)) {
        e.preventDefault();
        const h = hover === null ? N * N / 2 + N / 2 : hover,
            y = Math.max(0, Math.min(N - 1, Math.floor(h / N) + mv[0])),
            x = Math.max(0, Math.min(N - 1, h % N + mv[1]));
        hover = y * N + x;
        paint();
    }
    if ((k === 'enter' || k === ' ') && sel !== null && hover !== null && !document.activeElement.matches('button,.pc,input,select')) {
        e.preventDefault();
        click();
    }
    if (k === 'escape' && sel !== null) {
        sel = null;
        ui();
        paint();
    }
});

/* ==========================================================================
   9. NOVA PARTIDA E PERSISTÊNCIA
   Início de partida, preferências e estatísticas guardadas no localStorage e retomada de jogo.
   ========================================================================== */

/**
 * Inicia uma nova partida: reinicia todo o estado, define os jogadores humanos e começa a música da partida.
 */
function init() {
    gen++;
    hideEnd();
    music('game');
    snaps = [];
    lp = [];
    board = Array(N * N).fill(0);
    used = [0, new Set(), new Set(), new Set(), new Set()];
    started = [0, 0, 0, 0, 0];
    done = [0, 0, 0, 0, 0];
    cur = 1;
    sel = null;
    rot = 0;
    fl = 0;
    hover = null;
    over = false;
    humans = +$('#hum').value;
    HS = Array.from({ length: humans }, (_, k) => (mc - 1 + k) % 4 + 1);
    paint();
    ui();
    ai();
}

/**
 * Lê um valor do localStorage sem causar erro quando o armazenamento está indisponível.
 *
 * @param {string} k - Chave.
 * @returns {string|null} Valor salvo ou null.
 */
function lsGet(k) {
    try {
        return localStorage.getItem(k);
    } catch (e) {
        return null;
    }
}

/**
 * Salva as preferências (cor, dificuldade, som, volumes, símbolos, cantos e trilhas) no localStorage.
 */
function sset() {
    try {
        localStorage.setItem(
            'blocos_s',
            JSON.stringify({ mc, mute, dif, sym, showC, vm, vf, pref, hum: $('#hum').value })
        );
    } catch (e) {}
}

/**
 * Atualiza o texto dos botões "Cantos" e "Símbolos".
 */
function btns() {
    $('#cor').textContent = 'Cantos: ' + (showC ? 'sim' : 'não');
    $('#sym').textContent = 'Símbolos: ' + (sym ? 'sim' : 'não');
}

/**
 * Carrega as preferências salvas e aplica-as à interface (volumes, botões e número de jogadores).
 */
function loadS() {
    try {
        const s = JSON.parse(lsGet('blocos_s') || '{}');
        if (s.mc) mc = s.mc;
        if (s.pref) Object.assign(pref, s.pref);
        mute = !!s.mute;
        if (s.dif) dif = s.dif;
        sym = !!s.sym;
        if (s.showC !== undefined) showC = s.showC;
        if (s.vm !== undefined) vm = s.vm;
        if (s.vf !== undefined) vf = s.vf;
        if (s.hum && [...$('#hum').options].some(o => o.value == s.hum)) $('#hum').value = s.hum;
    } catch (e) {}
    $('#vm').value = vm * 100;
    $('#vf').value = vf * 100;
    btns();
}

/**
 * Destaca, na tela inicial, o botão da dificuldade escolhida.
 */
function dfp() {
    document.querySelectorAll('.df').forEach(b => b.classList.toggle('on', b.dataset.d === dif));
}

/**
 * Mostra na tela inicial as estatísticas salvas (partidas, vitórias e melhor pontuação).
 */
function stt() {
    const e = $('#stt');
    if (!e) return;
    let s = {};
    try {
        s = JSON.parse(lsGet('blocos_st') || '{}');
    } catch (x) {}
    e.textContent = s.g ? `Partidas: ${s.g} · Vitórias: ${s.w||0} · Melhor pontuação: ${s.b}` : '';
}

/**
 * Salva a partida em andamento; se ela terminou, remove o salvamento e atualiza as estatísticas.
 */
function sv() {
    try {
        if (over) {
            localStorage.removeItem('blocos_g');
            const sc = [1, 2, 3, 4].map(pts),
                top = Math.max(...sc),
                st = JSON.parse(lsGet('blocos_st') || '{}'),
                bp = Math.max(...HS.map(p => sc[p - 1]));
            st.g = (st.g || 0) + 1;
            if (HS.some(p => sc[p - 1] === top)) st.w = (st.w || 0) + 1;
            st.b = st.b === undefined ? bp : Math.max(st.b, bp);
            localStorage.setItem('blocos_st', JSON.stringify(st));
        } else localStorage.setItem(
            'blocos_g',
            JSON.stringify({
                b: board,
                u: used.map(s => s ? [...s] : 0),
                s: started,
                d: done,
                l: [0, 1, 2, 3, 4].map(k => last[k] === undefined ? null : last[k]),
                c: cur,
                h: humans,
                H: HS,
                lp: lp,
                df: dif
            })
        );
    } catch (e) {}
}

/**
 * Retoma a partida salva no localStorage.
 */
function resume() {
    const t = lsGet('blocos_g');
    if (!t) return;
    try {
        const g = JSON.parse(t);
        gen++;
        hideEnd();
        board = g.b;
        used = g.u.map(a => a ? new Set(a) : 0);
        started = g.s;
        done = g.d;
        for (let k = 0; k < 5; k++) last[k] = g.l[k] === null ? undefined : g.l[k];
        cur = g.c;
        humans = g.h;
        HS = g.H;
        lp = g.lp || [];
        dif = g.df || dif;
        snaps = [];
        over = false;
        sel = null;
        rot = 0;
        fl = 0;
        hover = null;
        $('#intro').classList.add('off');
        music('game');
        paint();
        ui();
        ai();
    } catch (e) {}
}

/* ==========================================================================
   10. CPU, DICAS E DESFAZER
   Cálculo de cantos, avaliação das jogadas por nível de dificuldade, dica e desfazer.
   ========================================================================== */

/**
 * Calcula as células onde a cor p pode encostar uma nova peça (apenas pelo canto). Antes da 1ª jogada, é o canto inicial.
 *
 * @param {number} p - Cor do jogador.
 * @returns {number[]} Índices das células.
 */
function corners(p) {
    const out = [];
    if (!started[p]) {
        const s = START[p][0] * N + START[p][1];
        if (!board[s]) out.push(s);
        return out;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (board[y * N + x]) continue;
        let bd = false, ok = false;
        for (const [dy, dx] of D4) {
            const a = y + dy, b = x + dx;
            if (a >= 0 && b >= 0 && a < N && b < N && board[a * N + b] === p) {
                bd = true;
                break;
            }
        }
        if (bd) continue;
        for (const [dy, dx] of DG) {
            const a = y + dy, b = x + dx;
            if (a >= 0 && b >= 0 && a < N && b < N && board[a * N + b] === p) {
                ok = true;
                break;
            }
        }
        if (ok) out.push(y * N + x);
    }
    return out;
}

/**
 * Dá uma nota a uma jogada conforme a dificuldade (fácil: quase aleatória; médio: peças grandes e centro; difícil: avalia cantos).
 *
 * @param {number} p - Cor do jogador.
 * @param {Object} m - Lance {i, o, r, c}.
 * @returns {number} Pontuação (maior = melhor).
 * Efeito colateral temporário: simula a jogada no tabuleiro e a desfaz em seguida.
 */
function evalM(p, m) {
    const n = PCS[m.i].n;
    // Fácil: quase aleatório. Médio: prefere peças grandes e o centro. Difícil: avalia os cantos.
    if (dif === 'facil') return Math.random() * 10 + n * .4;
    const ct = Math.hypot(m.r + m.o.h / 2 - N / 2, m.c + m.o.w / 2 - N / 2);
    if (dif === 'medio') return n * 3 + Math.random() * 4 - ct * .15;
    // Cantos dos adversários antes da jogada (calculado uma vez por lance).
    if (bc === null) {
        bc = 0;
        for (let q = 1; q <= 4; q++) if (q !== p && !done[q]) bc += corners(q).length;
    }
    // Simula a jogada, mede quantos cantos abre/fecha e desfaz a simulação.
    const ks = m.o.cells.map(([y, x]) => (y + m.r) * N + x + m.c), ws = started[p];
    ks.forEach(k => board[k] = p);
    started[p] = 1;
    const mine = corners(p).length;
    let aft = 0;
    for (let q = 1; q <= 4; q++) if (q !== p && !done[q]) aft += corners(q).length;
    ks.forEach(k => board[k] = 0);
    started[p] = ws;
    return n * 2.2 + mine * 1.2 + (bc - aft) * 1.5 - ct * .05 + Math.random();
}

/**
 * Mostra uma jogada sugerida (avaliada no nível difícil): seleciona a peça, ajusta rotação/espelhamento e posiciona a prévia.
 */
function hint() {
    if (over || !isH(cur)) return;
    const ms = moves(cur);
    if (!ms.length) return;
    const d0 = dif;
    // Usa temporariamente a avaliação "difícil" para sugerir a melhor jogada.
    dif = 'dificil';
    bc = null;
    let best = null, bs = -1e9;
    for (const m of ms) {
        const s = evalM(cur, m);
        if (s > bs) {
            bs = s;
            best = m;
        }
    }
    dif = d0;
    sel = best.i;
    // Descobre a rotação/espelhamento que reproduz a orientação sugerida.
    outer: for (let f = 0; f < 2; f++) for (let r = 0; r < 4; r++) {
        fl = f;
        rot = r;
        if (getO(sel).k === best.o.k) break outer;
    }
    hover = (best.r + Math.floor(best.o.h / 2)) * N + best.c + Math.floor(best.o.w / 2);
    ui();
    paint();
}

/**
 * Desfaz a última jogada humana (e as jogadas da CPU feitas depois dela).
 */
function undo() {
    if (over) return;
    let s = null;
    // Volta ao último estado em que era a vez de um humano.
    while (snaps.length) {
        const t = snaps.pop();
        if (isH(t.c)) {
            s = t;
            break;
        }
    }
    if (!s) return;
    gen++;
    board = s.b;
    used = s.u;
    started = s.s;
    done = s.d;
    for (let k = 0; k < 5; k++) last[k] = s.l[k];
    cur = s.c;
    lp = s.lp;
    sel = null;
    hover = null;
    paint();
    ui();
    sv();
    ai();
}

/* ==========================================================================
   11. TELAS: TUTORIAL, FIM DE JOGO E MENU INICIAL
   Telas criadas dinamicamente pelo script e pontuação final.
   ========================================================================== */

// Passos do tutorial: t = título; g = miniaturas ilustrativas; d = descrição.
const TUT = [
    {
        t: 'Comece pelo canto',
        g: [[['GG..', 'G...', '....', '....'], 'canto inicial']],
        d: 'Cada cor começa em um dos cantos do tabuleiro, marcado com a sua cor. A sua primeira peça precisa cobrir esse canto.'
    },
    {
        t: 'Toque apenas pelos vértices',
        g: [[['BB..', '..G.'], '✔ pelo vértice'], [['BB..', '.X..'], '✘ pelo lado']],
        d: 'As peças seguintes devem encostar nas suas somente pelos cantos, nunca pelos lados. Peças de outras cores podem encostar à vontade.'
    },
    {
        t: 'Como jogar',
        g: [],
        d: 'Arraste a peça da bandeja até o tabuleiro e solte, ou selecione-a e clique. Gire com R e espelhe com F. O botão Dica mostra uma jogada possível e Desfazer volta ao seu último lance. Pelo teclado, use as setas para mover a peça e Enter para confirmar.'
    },
    {
        t: 'Pontuação',
        g: [],
        d: 'Cada quadrado que sobra vale −1 ponto. Usar todas as peças dá +15, e mais 5 se a última for o quadrado único. Quando ninguém mais puder jogar, vence quem tiver mais pontos.'
    }
];

/**
 * Gera o HTML de uma miniatura de tabuleiro usada no tutorial.
 *
 * @param {string[]} rows - Linhas: "B" = peça existente, "G" = peça sugerida, "X" = posição inválida e "." = vazio.
 * @returns {string} HTML da miniatura.
 */
function mg(rows) {
    return `<div class='mg' style='grid-template-columns:repeat(${rows[0].length},24px)'>${rows.join('').split('').map(c=>`<i class='${c==='.'?'':c.toLowerCase()}'></i>`).join('')}</div>`;
}

/**
 * Abre o tutorial em passos, com botões "Anterior" e "Próximo".
 */
function how() {
    const old = $('#tut');
    if (old) old.remove();
    let s = 0;
    const e = document.createElement('div');
    e.id = 'tut';
    document.body.appendChild(e);
    /**
     * Desenha o passo atual do tutorial e liga os botões de navegação.
     */
    function r() {
        const T = TUT[s];
        e.innerHTML = `<div class='eb'><p>${s+1} de ${TUT.length}</p><h2>${T.t}</h2><div>${T.g.map(g=>`<div style='display:inline-block;text-align:center'>${mg(g[0])}<div style='color:var(--mt);font-size:13px'>${g[1]}</div></div>`).join('')}</div><p style='margin-top:10px'>${T.d}</p><div class='row' style='justify-content:center;margin-top:14px'><button id='tp' ${s?'':'disabled'}>Anterior</button><button id='tn'>${s<TUT.length-1?'Próximo':'Entendi'}</button></div></div>`;
        $('#tp').onclick = () => {
            s--;
            r();
        };
        $('#tn').onclick = () => {
            if (s < TUT.length - 1) {
                s++;
                r();
            } else {
                e.remove();
                try {
                    localStorage.setItem('blocos_t', '1');
                } catch (x) {}
            }
        };
    }
    r();
}

// last[p] = última peça colocada pela cor p (usada no bônus de pontuação).
const last = [];
// Pontuação: −1 por quadrado restante; +15 se usou todas as peças (+5 se a última foi o quadrado único).
const pts = p => rem(p) === 0 ? 15 + (last[p] === 0 ? 5 : 0) : -rem(p);

/**
 * Oculta a tela final, se existir.
 */
function hideEnd() {
    const e = $('#end');
    if (e) e.classList.add('off');
}

// endG = partida (gen) cuja tela final já foi exibida (evita reabrir o placar).
let endG = -1;

/**
 * Exibe a tela final (uma vez por partida) com o vencedor e a tabela de pontuação, e toca a música de encerramento.
 */
function showEnd() {
    const g = gen;
    if (endG === g) return;
    endG = g;
    // Aguarda 0,9 s para o jogador ver o tabuleiro final antes de abrir o placar.
    setTimeout(() => {
        if (g !== gen) return;
        const rows = [1, 2, 3, 4].map(p => ({ p, r: rem(p), n: used[p].size, s: pts(p) })).sort((a, b) => b.s - a.s),
            top = rows[0].s,
            w = rows.filter(x => x.s === top);
        let e = $('#end');
        if (!e) {
            e = document.createElement('div');
            e.id = 'end';
            document.body.appendChild(e);
        }
        const nm = p => `<span style="color:${COL[p]}">${NM[p]}</span>`;
        e.innerHTML = `<div class="eb"><div class="trophy">🏆</div><h2>${w.length>1?'Empate entre '+w.map(x=>nm(x.p)).join(' e '):nm(w[0].p)+' vence!'}</h2><p>Cada quadrado restante vale −1. Usar todas as peças dá +15 (+5 se a última for a menor).</p><table><tr><th>#</th><th>Jogador</th><th>Peças</th><th>Sobra</th><th>Pontos</th></tr>${rows.map(x=>`<tr class="${x.s===top?'win':''}"><td>${rows.findIndex(y=>y.s===x.s)+1}º</td><td><i class="dot" style="background:${COL[x.p]}"></i>${NM[x.p]}${isH(x.p)?'':' (CPU)'}</td><td>${x.n}/21</td><td>${x.r}</td><td>${x.s>0?'+'+x.s:x.s}</td></tr>`).join('')}</table><div class="row" style="justify-content:center"><button id="again">Jogar novamente</button><button id="view">Ver tabuleiro</button><button id="menu">Menu</button></div></div>`;
        e.classList.remove('off');
        music('end');
        $('#again').onclick = () => {
            e.classList.add('off');
            init();
        };
        $('#view').onclick = () => e.classList.add('off');
        $('#menu').onclick = intro;
    }, 900);
}

/**
 * Abre o menu inicial (criando-o na primeira vez), interrompe a partida em andamento e toca a música do menu.
 */
function intro() {
    gen++;
    hideEnd();
    music('menu');
    let o = $('#intro');
    // Cria o menu na primeira vez; nas seguintes, apenas o reexibe.
    if (!o) {
        o = document.createElement('div');
        o.id = 'intro';
        o.innerHTML = `<div class="ib"><div class="logo">${[1,2,4,3].map(p=>`<i style="background:${COL[p]}"></i>`).join('')}</div><h1>Blocos</h1><p>Encaixe as suas 21 peças no tabuleiro e ocupe o máximo de espaço possível.</p><div class="pick"><small>Escolha a sua cor</small><div id="pk">${[1,2,3,4].map(p=>`<button class="sw" data-c="${p}" style="background:${COL[p]}" title="${NM[p]}"></button>`).join('')}</div></div><div class="pick"><small>Dificuldade da CPU</small><div class="seg"><button class="df" data-d="facil">Fácil</button><button class="df" data-d="medio">Médio</button><button class="df" data-d="dificil">Difícil</button></div></div><div class="mode" id="m1"><button id="rs" style="display:none">Continuar partida<small>retomar de onde parou</small></button><button data-h="1">1 jogador<small>contra 3 CPUs</small></button><button id="mp">Multiplayer local<small>2 a 4 jogadores no mesmo dispositivo</small></button></div><div class="mode" id="m2"><button data-h="2">2 jogadores<small>mais 2 CPUs</small></button><button data-h="3">3 jogadores<small>mais 1 CPU</small></button><button data-h="4">4 jogadores<small>sem CPUs, revezando a vez</small></button><button id="back">Voltar</button></div><p id="stt" class="stt"></p><button id="how">Como jogar</button><ul><li>A primeira peça deve cobrir o seu canto inicial.</li><li>As peças seguintes tocam as suas apenas pelos cantos, nunca pelos lados.</li><li>Quem terminar com menos quadrados sobrando vence.</li></ul></div>`;
        document.body.appendChild(o);
        o.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
            $('#hum').value = b.dataset.h;
            o.classList.add('off');
            init();
        });
        $('#mp').onclick = () => {
            $('#m1').style.display = 'none';
            $('#m2').style.display = '';
        };
        $('#back').onclick = () => {
            $('#m2').style.display = 'none';
            $('#m1').style.display = '';
        };
    }
    $('#m2').style.display = 'none';
    $('#m1').style.display = '';
    document.querySelectorAll('.sw').forEach(b => b.onclick = () => {
        mc = +b.dataset.c;
        swp();
        sset();
    });
    swp();
    document.querySelectorAll('.df').forEach(b => b.onclick = () => {
        dif = b.dataset.d;
        dfp();
        sset();
    });
    dfp();
    stt();
    $('#how').onclick = how;
    $('#rs').style.display = lsGet('blocos_g') ? '' : 'none';
    $('#rs').onclick = resume;
    o.classList.remove('off');
}

/* ==========================================================================
   12. INICIALIZAÇÃO DO JOGO
   Liga os últimos eventos, carrega preferências e abre o menu inicial.
   ========================================================================== */

$('#new').onclick = intro;
$('#hum').onchange = init;
loadS();
init();
intro();
mkMute();
mkTrk();
if (!lsGet('blocos_t')) how();

/* ==========================================================================
   13. CONTROLE (GAMEPAD API)
   Navegação e jogo por controle, painel de configuração/teste e laço de leitura dos botões.
   ========================================================================== */

/* Controle (Gamepad API) */

// gpP = botões pressionados no quadro anterior; gpT = temporizadores de repetição; gc = canto atual;
// gpM = modo do controle ("tray" = escolhendo peça, "board" = posicionando); gpH = última posição no tabuleiro.
let gpP = {};
const gpT = {};
let gc = -1, gpM = 'tray', gpH = null;

/**
 * Alterna o modo do controle entre "escolher peça" (tray) e "posicionar no tabuleiro" (board).
 *
 * @param {string} m - "tray" ou "board".
 */
function gpMode(m) {
    gpM = m;
    if (m === 'board') {
        if (hover === null) hover = gpH ?? corners(cur)[0] ?? (N * N / 2 + N / 2);
    } else if (hover !== null) {
        gpH = hover;
        hover = null;
    }
    paint();
    tst(m === 'board' ? 'Posicionar no tabuleiro' : 'Escolher peça');
}

/**
 * Exibe uma mensagem rápida (toast) na tela.
 *
 * @param {string} m - Texto.
 */
function tst(m) {
    let t = $('#toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toast';
        document.body.appendChild(t);
    }
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(tt);
    tt = setTimeout(() => t.classList.remove('on'), 2500);
}

/**
 * Informa qual tela sobreposta está ativa (tutorial, fim de jogo ou menu inicial).
 *
 * @returns {Element|null} Elemento da tela ou null.
 */
function gpOv() {
    const v = e => e && !e.classList.contains('off') ? e : null;
    return $('#tut') || v($('#end')) || v($('#intro'));
}

/**
 * Seleciona a peça seguinte ou anterior entre as disponíveis do jogador da vez.
 *
 * @param {number} d - Direção (1 = próxima, -1 = anterior).
 */
function gpPc(d) {
    if (over || !isH(cur)) return;
    const a = [];
    for (let i = 0; i < 21; i++) if (!used[cur].has(i)) a.push(i);
    if (!a.length) return;
    const k = a.indexOf(sel);
    sel = a[k < 0 ? (d > 0 ? 0 : a.length - 1) : (k + d + a.length) % a.length];
    rot = 0;
    fl = 0;
    if (gpM === 'tray') {
        if (hover !== null) {
            gpH = hover;
            hover = null;
        }
    } else if (hover === null) hover = gpH ?? corners(cur)[0] ?? (N * N / 2 + N / 2);
    ui();
    paint();
}

/**
 * Move a seleção da bandeja para a fileira de cima ou de baixo, escolhendo a peça mais próxima na horizontal.
 *
 * @param {number} dy - Direção vertical (1 = baixo, -1 = cima).
 */
function gpTray(dy) {
    const el = [...document.querySelectorAll('#tray .pc')], a = [];
    for (let i = 0; i < 21; i++) if (!used[cur].has(i)) a.push(i);
    const k = a.indexOf(sel);
    if (k < 0 || el.length !== a.length) return gpPc(1);
    const R = el.map(e => e.getBoundingClientRect()),
        c = R[k],
        cx = c.left + c.width / 2,
        cand = R.map((q, j) => j).filter(j => dy > 0 ? R[j].top > c.top + 4 : R[j].top < c.top - 4);
    if (!cand.length) return;
    const rt = dy > 0 ? Math.min(...cand.map(j => R[j].top)) : Math.max(...cand.map(j => R[j].top)),
        row = cand.filter(j => Math.abs(R[j].top - rt) < 4),
        dx = j => Math.abs(R[j].left + R[j].width / 2 - cx),
        j = row.reduce((b, j) => dx(j) < dx(b) ? j : b, row[0]);
    sel = a[j];
    rot = 0;
    fl = 0;
    ui();
    paint();
}

/**
 * Move a seleção (na bandeja) ou a peça (no tabuleiro) conforme o direcional/analógico.
 *
 * @param {number} dy - Deslocamento vertical.
 * @param {number} dx - Deslocamento horizontal.
 */
function gpMove(dy, dx) {
    if (over || !isH(cur)) return;
    if (sel === null || gpM === 'tray') {
        if (dy) gpTray(dy);
        else if (dx) gpPc(dx);
        return;
    }
    const h = hover === null ? N * N / 2 + N / 2 : hover;
    hover = Math.max(0, Math.min(N - 1, Math.floor(h / N) + dy)) * N + Math.max(
        0,
        Math.min(N - 1, h % N + dx)
    );
    paint();
}

/**
 * Salta entre os cantos disponíveis do jogador da vez.
 *
 * @param {number} d - Direção (1 = próximo, -1 = anterior).
 */
function gpCor(d) {
    if (over || sel === null || !isH(cur)) return;
    const c = corners(cur);
    if (!c.length) return;
    gc = ((gc + d) % c.length + c.length) % c.length;
    hover = c[gc];
    paint();
}

/**
 * Executa a ação de um comando do controle (navegar em telas, escolher/posicionar peça, girar, espelhar, desfazer, dica).
 *
 * @param {string} k - Comando: a, b, x, y, lb, rb, lt, rt, sel, st, u, d, l ou r.
 */
function gpAct(k) {
    document.body.classList.add('gpm');
    if (AC && AC.state === 'suspended') AC.resume();
    const ov = gpOv();
    if (ov) {
        if (ov.id === 'tut') {
            if (k === 'a') $('#tn').click();
            return;
        }
        const bs = [...ov.querySelectorAll('button')].filter(b => !b.disabled && b.getClientRects().length),
            i = bs.indexOf(document.activeElement);
        if (!bs.length) return;
        if (k === 'a') {
            if (i < 0) bs[0].focus();
            else bs[i].click();
            return;
        }
        const d = { d: 1, r: 1, u: -1, l: -1 }[k];
        if (d) bs[i < 0 ? 0 : (i + d + bs.length) % bs.length].focus();
        return;
    }
    if (over) return;
    switch (k) {
        case 'u':
            gpMove(-1, 0);
            break;
        case 'd':
            gpMove(1, 0);
            break;
        case 'l':
            gpMove(0, -1);
            break;
        case 'r':
            gpMove(0, 1);
            break;
        case 'a':
            if (!isH(cur)) break;
            if (sel === null) gpM = 'tray';
            if (gpM === 'tray') {
                if (sel === null) gpPc(1);
                else gpMode('board');
            } else {
                click();
                if (sel === null) {
                    gpM = 'tray';
                    gpH = null;
                    hover = null;
                }
            }
            break;
        case 'b':
            if (gpM === 'board' && sel !== null) gpMode('tray');
            else if (sel !== null) {
                sel = null;
                ui();
                paint();
            }
            break;
        case 'x':
            tf(1, 0);
            break;
        case 'y':
            tf(0, 1);
            break;
        case 'lb':
            gpPc(-1);
            break;
        case 'rb':
            gpPc(1);
            break;
        case 'lt':
            gpCor(-1);
            break;
        case 'rt':
            gpCor(1);
            break;
        case 'sel':
            undo();
            gpM = 'tray';
            break;
        case 'st':
            hint();
            gpM = 'board';
    }
}

// Nomes (em português) dos comandos do controle.
const GPN = {
    a: 'Confirmar',
    b: 'Cancelar',
    x: 'Girar',
    y: 'Espelhar',
    lb: 'Peça anterior',
    rb: 'Próxima peça',
    lt: 'Canto anterior',
    rt: 'Próximo canto',
    sel: 'Desfazer',
    st: 'Dica',
    u: 'Cima',
    d: 'Baixo',
    l: 'Esquerda',
    r: 'Direita'
};

// Configuração padrão: map = botão de cada comando; dz = zona morta; rep = intervalo de repetição; ax/ay = eixos.
const GPD = {
    map: {
        a: 0,
        b: 1,
        x: 2,
        y: 3,
        lb: 4,
        rb: 5,
        lt: 6,
        rt: 7,
        sel: 8,
        st: 9,
        u: 12,
        d: 13,
        l: 14,
        r: 15
    },
    dz: .5,
    rep: 90,
    ax: 0,
    ay: 1
};

// gpc = configuração atual; gpB = comando aguardando novo botão; gpBlk = acesso bloqueado; gpL = última ação.
let gpc = JSON.parse(JSON.stringify(GPD)), gpB = null, gpBlk = false, gpL = '';

// Carrega a configuração do controle salva anteriormente (se existir).
try {
    const o = JSON.parse(lsGet('blocos_gp') || 'null');
    if (o) gpc = Object.assign(gpc, o, { map: Object.assign({}, GPD.map, o.map) });
} catch (e) {}

/**
 * Salva a configuração do controle no localStorage.
 */
function gpSave() {
    try {
        localStorage.setItem('blocos_gp', JSON.stringify(gpc));
    } catch (e) {}
}

/**
 * Informa se o painel de configuração do controle está aberto.
 *
 * @returns {boolean}
 */
function gpOpen() {
    const p = $('#gpp');
    return p && p.style.display !== 'none';
}

/**
 * Registra a última ação e a repassa ao jogo (exceto com o painel do controle aberto).
 *
 * @param {string} k - Comando.
 */
function gpAct2(k) {
    gpL = GPN[k];
    if (gpOpen()) return;
    gpAct(k);
}

/**
 * Redesenha o painel de configuração do controle (botões, controles deslizantes e seletores).
 */
function gpR() {
    if (!$('#gpp')) return;
    $('#gpk').innerHTML = Object.keys(GPN).map(k => `<button data-k="${k}" class="${gpB===k?'on':''}">${GPN[k]}: <b>${gpB===k?'aperte…':gpc.map[k]}</b></button>`).join('');
    $('#gdz').value = gpc.dz * 100;
    $('#grp').value = gpc.rep;
    $('#gax').value = gpc.ax;
    $('#gay').value = gpc.ay;
    if (gpBlk) $('#gps').textContent = 'Acesso a controles bloqueado neste ambiente (política do navegador). Abra o index.html direto no navegador.';
}

/**
 * Cria o botão 🎮 e o painel de configuração e teste do controle.
 */
function mkGp() {
    const b = document.createElement('button');
    b.id = 'gpb';
    b.title = 'Controle: configuração e teste';
    b.textContent = '🎮';
    const p = document.createElement('div');
    p.id = 'gpp';
    p.className = 'card';
    p.style.display = 'none';
    const O = '<option value="-1">—</option>' + [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<option value="${i}">${i}</option>`).join('');
    p.innerHTML = `<b>🎮 Controle — configuração e teste</b><div id="gps" style="font-size:13px;color:var(--mt)">Nenhum controle detectado. Conecte e aperte um botão.</div><div id="gpt"></div><div class="gpg" id="gpk"></div><small style="color:var(--mt)">Toque num comando e aperte o botão do controle para trocá-lo. Com este painel aberto, o controle não joga.</small><label>Zona morta do analógico<input id="gdz" type="range" min="10" max="90"></label><label>Intervalo de repetição (ms)<input id="grp" type="range" min="40" max="250"></label><label>Eixo horizontal<select id="gax">${O}</select></label><label>Eixo vertical<select id="gay">${O}</select></label><button id="gpx">Restaurar padrão</button>`;
    b.onclick = () => {
        const q = $('#trkp');
        if (q) q.style.display = 'none';
        p.style.display = p.style.display === 'none' ? '' : 'none';
        gpB = null;
        gpR();
    };
    p.oninput = e => {
        const t = e.target, v = +t.value;
        if (t.id === 'gdz') gpc.dz = v / 100;
        else if (t.id === 'grp') gpc.rep = v;
        else if (t.id === 'gax') gpc.ax = v;
        else if (t.id === 'gay') gpc.ay = v;
        gpSave();
    };
    p.onclick = e => {
        const t = e.target.closest('[data-k]');
        if (t) {
            gpB = gpB === t.dataset.k ? null : t.dataset.k;
            gpR();
        } else if (e.target.id === 'gpx') {
            gpc = JSON.parse(JSON.stringify(GPD));
            gpSave();
            gpR();
        }
    };
    document.body.append(b, p);
    gpR();
}

/**
 * Lê o estado dos controles a cada quadro, trata remapeamento, direcional com repetição e botões de ação.
 */
function gpLoop() {
    let ps = [];
    try {
        ps = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch (e) {
        gpBlk = true;
        gpR();
        return;
    }
    const bt = {}, ax = [0, 0], p0 = Array.from(ps).find(x => x), m = gpc.map, z = gpc.dz;
    for (const p of ps) {
        if (!p) continue;
        p.buttons.forEach((b, i) => {
            if (b.pressed) bt[i] = 1;
        });
        [gpc.ax, gpc.ay].forEach((a, j) => {
            const v = p.axes[a] || 0;
            if (Math.abs(v) > Math.abs(ax[j])) ax[j] = v;
        });
    }
    const now = performance.now(),
        dr = {
            u: bt[m.u] || ax[1] < -z,
            d: bt[m.d] || ax[1] > z,
            l: bt[m.l] || ax[0] < -z,
            r: bt[m.r] || ax[0] > z
        };
    // Remapeamento: o próximo botão pressionado vira o comando escolhido; caso contrário, o direcional/analógico repete a ação automaticamente (350 ms de espera inicial).
    if (gpB) {
        for (const i in bt) if (!gpP[i]) {
            m[gpB] = +i;
            gpB = null;
            gpSave();
            gpR();
            break;
        }
    } else for (const k in dr) {
        if (!dr[k]) {
            delete gpT[k];
            continue;
        }
        if (gpT[k] === undefined) {
            gpAct2(k);
            gpT[k] = now + 350;
        } else if (now >= gpT[k]) {
            gpAct2(k);
            gpT[k] = now + gpc.rep;
        }
    }
    if (!gpB) for (const k of ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'sel', 'st']) if (bt[m[k]] && !gpP[m[k]]) gpAct2(k);
    gpP = bt;
    if (gpOpen()) {
        $('#gps').textContent = p0 ? `${p0.id.slice(0,48)} · mapeamento: ${p0.mapping||'não padrão'}` : 'Nenhum controle detectado. Conecte e aperte um botão.';
        $('#gpt').innerHTML = p0 ? `<div>${Array.from(p0.buttons).map((b,i)=>`<span class="gpd${b.pressed?' on':''}">${i}</span>`).join('')}</div><div style="font-size:12px;color:var(--mt)">Eixos: ${Array.from(p0.axes).map((v,i)=>i+': '+v.toFixed(2)).join(' · ')}</div><div style="font-size:12px;color:var(--mt)">Última ação: ${gpL||'—'}</div>` : '';
    }
    requestAnimationFrame(gpLoop);
}

// Cria o painel do controle e liga os eventos de conexão/desconexão.
mkGp();

addEventListener('gamepadconnected', () => {
    document.body.classList.add('gpm');
    const h = $('#gph');
    if (h) h.style.display = '';
    tst('🎮 Controle conectado');
});

addEventListener('gamepaddisconnected', () => tst('Controle desconectado'));
// Inicia o laço que lê o controle a cada quadro.
requestAnimationFrame(gpLoop);
