/**
 * BLOCOS — multiplayer online (cliente).
 * Carregado ANTES de script.js. Cuida da conexão WebSocket, da sala (lobby) e do recebimento das jogadas.
 * As regras continuam em script.js: cada navegador valida e aplica as mesmas jogadas.
 */

// Endereço do servidor. Local: 'ws://localhost:3000'. Publicado: 'wss://SEU-APP.onrender.com' (use wss, não ws).
const SERVER = 'wss://blocos-7b9m.onrender.com';

// Estado da conexão: on = em sala; seat = minha cor (1 a 4); host = sou o anfitrião;
// seats = quais cores têm jogador conectado; go = autoriza init() a iniciar; started = partida em andamento.
const net = {
    on: false, ws: null, seat: 0, host: false, code: '', seats: [0, 0, 0, 0], go: false, started: false, hb: 0,
    send(o) {
        if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
    }
};

// Verdadeiro se a cor p pode ser controlada por este navegador.
const mine = p => net.on ? p === net.seat : isH(p);

/** Sai da sala, fecha a conexão e remove a tela da sala. */
function netLeave() {
    clearInterval(net.hb);
    if (net.ws) {
        net.ws.onclose = null;
        net.ws.close();
    }
    Object.assign(net, { ws: null, on: false, go: false, started: false });
    const l = document.getElementById('lob');
    if (l) l.remove();
}

/** Abre a conexão (se necessário) e envia a mensagem inicial: criar ou entrar numa sala. */
function netOpen(msg) {
    if (net.ws && net.ws.readyState <= 1) {
        // Já conectado (ex.: código errado na tentativa anterior): reaproveita a conexão.
        if (net.ws.readyState === 1) net.send(msg);
        return;
    }
    lobbyMsg('Conectando…');
    const ws = new WebSocket(SERVER);
    net.ws = ws;
    ws.onopen = () => {
        lobbyMsg('');
        net.send(msg);
        net.hb = setInterval(() => net.send({ t: 'ping' }), 25000);
    };
    ws.onmessage = e => {
        try { netMsg(JSON.parse(e.data)); } catch (x) {}
    };
    ws.onerror = () => lobbyMsg('Não foi possível conectar ao servidor.');
    ws.onclose = () => {
        const was = net.started, txt = (document.getElementById('lmsg') || {}).textContent;
        if (was) {
            netLeave();
            intro();
            tst('Conexão perdida.');
        } else {
            clearInterval(net.hb);
            Object.assign(net, { ws: null, on: false });
            drawLobby();
            lobbyMsg(txt || 'Conexão encerrada.');
        }
    };
}

/** Trata as mensagens recebidas do servidor. */
function netMsg(m) {
    if (m.t === 'err') return lobbyMsg(m.msg);
    if (m.t === 'joined') {
        Object.assign(net, { on: true, code: m.code, seat: m.seat, host: m.host === m.seat, seats: m.seats });
        return drawLobby();
    }
    if (m.t === 'lobby') {
        net.seats = m.seats;
        return drawLobby();
    }
    if (m.t === 'start') {
        net.seats = m.seats;
        net.started = true;
        if (['facil', 'medio', 'dificil'].includes(m.dif)) dif = m.dif;
        const l = document.getElementById('lob');
        if (l) l.remove();
        document.getElementById('intro').classList.add('off');
        net.go = true;
        init();
        net.go = false;
        return;
    }
    if (m.t === 'move') {
        // Valida a jogada recebida com as mesmas regras locais antes de aplicá-la.
        const o = PCS[m.i] && PCS[m.i].os.find(x => x.k === m.k);
        if (!o || over || m.p !== cur || used[m.p].has(m.i) || !valid(m.p, o, m.r, m.c)) return;
        return place(m.p, m.i, o, m.r, m.c, true);
    }
    if (m.t === 'left') {
        net.seats = m.seats;
        net.host = m.host === net.seat;
        if (!net.started) return drawLobby();
        HS = HS.filter(s => s !== m.seat); // a cor de quem saiu passa a ser CPU
        tst(NM[m.seat] + ' saiu e foi substituído pela CPU.');
        ui();
        ai(); // só age no anfitrião e se for a vez de uma CPU
    }
}

/** Mostra uma mensagem na tela da sala. */
function lobbyMsg(t) {
    const e = document.getElementById('lmsg');
    if (e) e.textContent = t;
}

/** Abre a tela "Jogar online". */
function lobby() {
    if (!document.getElementById('lob')) {
        const l = document.createElement('div');
        l.id = 'lob';
        document.body.appendChild(l);
    }
    drawLobby();
}

/** Desenha a tela da sala: criar/entrar (sem sala) ou código e jogadores (em sala). */
function drawLobby() {
    const l = document.getElementById('lob');
    if (!l) return;
    if (!net.on) {
        l.innerHTML = `<div class="eb"><div class="trophy">🌐</div><h2>Jogar online</h2><p>Até 4 jogadores por sala.</p>
            <div class="row" style="justify-content:center;margin:14px 0"><button id="lc">Criar sala</button></div>
            <p>ou entre com um código</p>
            <div class="row" style="justify-content:center;margin-top:8px"><input id="lcode" maxlength="5" placeholder="CÓDIGO" autocomplete="off"><button id="lj">Entrar</button></div>
            <p id="lmsg" style="margin-top:10px;min-height:18px"></p><button id="lx" style="margin-top:6px">Voltar</button></div>`;
        document.getElementById('lc').onclick = () => netOpen({ t: 'create' });
        document.getElementById('lj').onclick = () => netOpen({ t: 'join', code: document.getElementById('lcode').value });
    } else {
        l.innerHTML = `<div class="eb"><p>Código da sala</p><div class="code">${net.code}</div><p>Compartilhe este código com os seus amigos.</p>
            <div class="lseats">${[1, 2, 3, 4].map(p => `<div style="color:${COL[p]}"><i class="dot" style="background:${COL[p]}"></i>${NM[p]}: ${net.seats[p - 1] ? (p === net.seat ? 'você' : 'conectado') : 'CPU (vaga livre)'}</div>`).join('')}</div>
            ${net.host ? '<button id="ls">Iniciar partida</button>' : '<p>Aguardando o anfitrião iniciar…</p>'}
            <p id="lmsg" style="min-height:18px"></p><button id="lx" style="margin-top:6px">Sair</button></div>`;
        if (net.host) document.getElementById('ls').onclick = () => net.send({ t: 'start', dif });
    }
    document.getElementById('lx').onclick = netLeave;
}
