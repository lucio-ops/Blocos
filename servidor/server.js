/**
 * BLOCOS — servidor do multiplayer online.
 * Cria salas com código de 5 caracteres (até 4 jogadores) e repassa as jogadas entre os navegadores.
 * Uso: npm install && node server.js   (porta 3000, ou a definida em PORT)
 */
const http = require('http');
const { WebSocketServer } = require('ws');

// Responde "ok" a requisições comuns (verificação de saúde da hospedagem).
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Blocos online: ok');
});
const wss = new WebSocketServer({ server });
const rooms = new Map();
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem letras/números parecidos (0, O, 1, I)

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const lobby = r => r.seats.map(Boolean);
const cast = (r, o, except) => r.seats.forEach(w => w && w !== except && send(w, o));

function newCode() {
    let c;
    do c = Array.from({ length: 5 }, () => ABC[Math.random() * ABC.length | 0]).join('');
    while (rooms.has(c));
    return c;
}

wss.on('connection', ws => {
    ws.room = null;
    ws.seat = 0;
    ws.on('message', raw => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }
        if (!m || typeof m !== 'object') return;

        // Criar sala: o criador é o anfitrião e ocupa a cor 1.
        if (m.t === 'create' && !ws.room) {
            const r = { code: newCode(), host: 1, started: false, seats: [ws, null, null, null] };
            rooms.set(r.code, r);
            ws.room = r;
            ws.seat = 1;
            return send(ws, { t: 'joined', code: r.code, seat: 1, host: 1, seats: lobby(r) });
        }

        // Entrar numa sala pelo código.
        if (m.t === 'join' && !ws.room) {
            const r = rooms.get(String(m.code || '').toUpperCase().trim());
            if (!r) return send(ws, { t: 'err', msg: 'Sala não encontrada.' });
            if (r.started) return send(ws, { t: 'err', msg: 'A partida já começou.' });
            const k = r.seats.indexOf(null);
            if (k < 0) return send(ws, { t: 'err', msg: 'Sala cheia.' });
            r.seats[k] = ws;
            ws.room = r;
            ws.seat = k + 1;
            send(ws, { t: 'joined', code: r.code, seat: k + 1, host: r.host, seats: lobby(r) });
            return cast(r, { t: 'lobby', seats: lobby(r) }, ws);
        }

        const r = ws.room;
        if (!r) return;

        // Iniciar (ou reiniciar) a partida: só o anfitrião.
        if (m.t === 'start' && ws.seat === r.host) {
            if (r.seats.filter(Boolean).length < 2) return send(ws, { t: 'err', msg: 'São necessários ao menos 2 jogadores.' });
            r.started = true;
            const dif = ['facil', 'medio', 'dificil'].includes(m.dif) ? m.dif : 'medio';
            return cast(r, { t: 'start', seats: lobby(r), dif });
        }

        // Jogada: cada um joga pela sua cor; o anfitrião também joga pelas cores sem jogador (CPUs).
        if (m.t === 'move' && r.started) {
            const ok = [m.p, m.i, m.r, m.c].every(Number.isInteger) && m.p >= 1 && m.p <= 4 &&
                typeof m.k === 'string' && m.k.length < 200 &&
                (m.p === ws.seat || (ws.seat === r.host && !r.seats[m.p - 1]));
            if (ok) cast(r, { t: 'move', p: m.p, i: m.i, r: m.r, c: m.c, k: m.k }, ws);
        }
    });

    ws.on('close', () => {
        const r = ws.room;
        if (!r) return;
        r.seats[ws.seat - 1] = null;
        if (!r.seats.some(Boolean)) return rooms.delete(r.code);
        if (r.host === ws.seat) r.host = r.seats.findIndex(Boolean) + 1; // o próximo jogador vira anfitrião
        cast(r, { t: 'left', seat: ws.seat, host: r.host, seats: lobby(r) });
    });
});

server.listen(process.env.PORT || 3000, () => console.log('Blocos online na porta ' + (process.env.PORT || 3000)));
