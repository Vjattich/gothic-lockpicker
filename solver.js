const
    MIN = -3,
    MAX = 3,
// Values occupy [-3, 3] -> stored as 0..6, packed 3 bits per plate into one number.
// 3 bits * 17 plates = 51 bits < 2^53, so exact float arithmetic. (BFS over 7^18+
// states is infeasible anyway, so n > 17 is rejected.)
    MAX_N = 17;

self.onmessage = (event) => {
    try {
        const { n, start, effects, mode, timeoutMs } = event.data;
        const result = solve(n, start, effects, mode, timeoutMs);
        self.postMessage(result);
    } catch (error) {
        self.postMessage({ error: error?.message || "Solver worker failed." });
    }
};

/* ---------- packed state helpers ---------- */

const buildPows = (n) => {
    const pows = new Float64Array(n);
    let p = 1;
    for (let i = 0; i < n; i++) { pows[i] = p; p *= 8; }
    return pows;
};

const encode = (values, pows) => {
    let code = 0;
    for (let i = 0; i < values.length; i++) code += (values[i] - MIN) * pows[i];
    return code;
};

const decode = (code, n, pows) => {
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = (Math.floor(code / pows[i]) % 8) + MIN;
    return out;
};

/* ---------- precomputed move table ----------
   Move id m = (plate-1)*2 + (0 = left, 1 = right).
   For each move we precompute the affected slot weights (powers of 8)
   and the signed unit delta for each, derived once from the effects matrix.
*/

const buildMoves = (n, effects, pows) => {
    const movePows = [], moveDeltas = [], plates = [], dirs = [];
    for (let plate = 1; plate <= n; plate++) {
        const row = effects[plate - 1] || [];
        for (let d = 0; d < 2; d++) {
            const delta = d === 1 ? 1 : -1;
            const ps = [pows[plate - 1]], ds = [delta];
            for (let t = 1; t <= n; t++) {
                if (t === plate) continue;
                const rel = Number(row[t - 1] || 0);
                if (rel === 0) continue;
                ps.push(pows[t - 1]);
                ds.push(rel === 1 ? delta : -delta);
            }
            movePows.push(Float64Array.from(ps));
            moveDeltas.push(Int8Array.from(ds));
            plates.push(plate);
            dirs.push(d === 1 ? "right" : "left");
        }
    }
    return { movePows, moveDeltas, plates, dirs, count: n * 2 };
};

// Returns the next packed state, or -1 if any affected value leaves [MIN, MAX].
// No allocation, touches only the affected slots.
const applyMoveCode = (code, ps, ds) => {
    let next = code;
    for (let k = 0; k < ps.length; k++) {
        const p = ps[k], dlt = ds[k];
        const nv = (Math.floor(code / p) % 8) + dlt;
        if (nv < 0 || nv > 6) return -1;
        next += dlt * p;
    }
    return next;
};

/* ---------- solution reconstruction ---------- */

const buildSolution = (goalIndex, prevArr, moveArr, countArr, codeArr, n, pows, moves) => {
    const outMoves = [], states = [];
    let idx = goalIndex;
    while (idx !== -1) {
        states.push(decode(codeArr[idx], n, pows));
        const m = moveArr[idx];
        if (m !== -1) {
            const count = countArr ? countArr[idx] : 1;
            for (let i = 0; i < count; i++) {
                outMoves.push({ plate: moves.plates[m], direction: moves.dirs[m] });
            }
        }
        idx = prevArr[idx];
    }
    outMoves.reverse();
    states.reverse();
    return { moves: outMoves, states };
};

/*
  ---------- fast BFS: fewest moves ----------
   The nodes array doubles as the FIFO queue (nodes are appended in discovery
   order), so no separate queue structure is needed.
*/
const solveFastShortestMoves = (n, startCode, goalCode, moves, pows, timeoutMs) => {
    if (startCode === goalCode) return { moves: [], states: [decode(startCode, n, pows)] };
    const codeArr = [startCode], prevArr = [-1], moveArr = [-1];
    const seen = new Set([startCode]);
    const M = moves.count, movePows = moves.movePows, moveDeltas = moves.moveDeltas;
    const startTime = Date.now();
    let ticks = 0;
    for (let head = 0; head < codeArr.length; head++) {
        if ((++ticks & 1023) === 0 && Date.now() - startTime > timeoutMs) return { timeout: true };
        const code = codeArr[head];
        for (let m = 0; m < M; m++) {
            const next = applyMoveCode(code, movePows[m], moveDeltas[m]);
            if (next < 0 || seen.has(next)) continue;
            seen.add(next);
            codeArr.push(next);
            prevArr.push(head);
            moveArr.push(m);
            if (next === goalCode) {
                return buildSolution(codeArr.length - 1, prevArr, moveArr, null, codeArr, n, pows, moves);
            }
        }
    }
    return null;
};

/* ---------- fast BFS over move chains: fewer plate switches ---------- */

const solveFastFewerPlateSwitches = (n, startCode, goalCode, moves, pows, timeoutMs) => {
    if (startCode === goalCode) return { moves: [], states: [decode(startCode, n, pows)] };
    const codeArr = [startCode], prevArr = [-1], moveArr = [-1], countArr = [0];
    const seen = new Set([startCode]);
    const M = moves.count, movePows = moves.movePows, moveDeltas = moves.moveDeltas;
    const startTime = Date.now();
    let ticks = 0;
    for (let head = 0; head < codeArr.length; head++) {
        if ((++ticks & 1023) === 0 && Date.now() - startTime > timeoutMs) return { timeout: true };
        const baseCode = codeArr[head];
        for (let m = 0; m < M; m++) {
            const ps = movePows[m], ds = moveDeltas[m];
            let chain = baseCode;
            for (let count = 1; ; count++) {
                chain = applyMoveCode(chain, ps, ds);
                if (chain < 0) break;
                if (seen.has(chain)) continue;
                seen.add(chain);
                codeArr.push(chain);
                prevArr.push(head);
                moveArr.push(m);
                countArr.push(count);
                if (chain === goalCode) {
                    return buildSolution(codeArr.length - 1, prevArr, moveArr, countArr, codeArr, n, pows, moves);
                }
            }
        }
    }
    return null;
};

/*
   --------- exact Dijkstra: (moves, groups) lexicographic cost ----------
   Cost pair is packed into a single number (primary * 2^20 + secondary) so
   comparisons are one numeric compare. Search states are (stateCode, lastMove);
   per-state costs live in a Float64Array indexed by lastMove+1, keyed by the
   numeric state code. The heap uses parallel primitive arrays with stale-entry
   skipping instead of decrease-key.
*/

const solveWithPriority = (n, startCode, goalCode, moves, pows, mode, timeoutMs) => {
    if (startCode === goalCode) return { moves: [], states: [decode(startCode, n, pows)] };
    const M = moves.count, movePows = moves.movePows, moveDeltas = moves.moveDeltas;
    const shortest = mode === "shortest";
    const BIG = 1 << 20;
    const pack = shortest
        ? (mv, gr) => mv * BIG + gr
        : (mv, gr) => gr * BIG + mv;

    const codeArr = [startCode], prevArr = [-1], moveArr = [-1];
    const movesN = [0], groupsN = [0], lastM = [-1];

    const best = new Map();
    const first = new Float64Array(M + 1).fill(Infinity);
    first[0] = pack(0, 0);
    best.set(startCode, first);

    // binary min-heap over (priority, insertion index) in parallel arrays
    const hp = [], hi = [];
    const heapPush = (prio, idx) => {
        hp.push(prio);
        hi.push(idx);
        let i = hp.length - 1;
        while (i > 0) {
            const par = (i - 1) >> 1;
            if (hp[par] < hp[i] || (hp[par] === hp[i] && hi[par] <= hi[i])) break;
            const tp = hp[par]; hp[par] = hp[i]; hp[i] = tp;
            const ti = hi[par]; hi[par] = hi[i]; hi[i] = ti;
            i = par;
        }
    };
    const heapPop = () => {
        const top = hi[0];
        const lp = hp.pop(), li = hi.pop();
        if (hp.length > 0) {
            hp[0] = lp; hi[0] = li;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let s = i;
                if (l < hp.length && (hp[l] < hp[s] || (hp[l] === hp[s] && hi[l] < hi[s]))) s = l;
                if (r < hp.length && (hp[r] < hp[s] || (hp[r] === hp[s] && hi[r] < hi[s]))) s = r;
                if (s === i) break;
                const tp = hp[s]; hp[s] = hp[i]; hp[i] = tp;
                const ti = hi[s]; hi[s] = hi[i]; hi[i] = ti;
                i = s;
            }
        }
        return top;
    };

    heapPush(pack(0, 0), 0);
    const startTime = Date.now();
    let ticks = 0;
    while (hp.length > 0) {
        if ((++ticks & 511) === 0 && Date.now() - startTime > timeoutMs) return { timeout: true };
        const ci = heapPop();
        const code = codeArr[ci];
        const packed = pack(movesN[ci], groupsN[ci]);
        const bArr = best.get(code);
        if (!bArr || bArr[lastM[ci] + 1] !== packed) continue; // stale heap entry
        if (code === goalCode) {
            return buildSolution(ci, prevArr, moveArr, null, codeArr, n, pows, moves);
        }
        const lm = lastM[ci], cm = movesN[ci], cg = groupsN[ci];
        for (let m = 0; m < M; m++) {
            const next = applyMoveCode(code, movePows[m], moveDeltas[m]);
            if (next < 0) continue;
            const nm = cm + 1;
            const ng = cg + (lm === m ? 0 : 1);
            const np = pack(nm, ng);
            let nb = best.get(next);
            if (nb === undefined) {
                nb = new Float64Array(M + 1).fill(Infinity);
                best.set(next, nb);
            } else if (np >= nb[m + 1]) {
                continue;
            }
            nb[m + 1] = np;
            const ni = codeArr.length;
            codeArr.push(next);
            prevArr.push(ci);
            moveArr.push(m);
            movesN.push(nm);
            groupsN.push(ng);
            lastM.push(m);
            heapPush(np, ni);
        }
    }
    return null;
};

const solve = (n, start, effects, mode, timeoutMs) => {
    if (n > MAX_N) throw new Error(`Solver supports up to ${MAX_N} plates.`);
    for (let i = 0; i < n; i++) {
        if (start[i] < MIN || start[i] > MAX) throw new Error("Start values out of range.");
    }
    const pows = buildPows(n);
    const moves = buildMoves(n, effects, pows);
    const startCode = encode(start, pows);
    let goalCode = 0;
    for (let i = 0; i < n; i++) goalCode += (0 - MIN) * pows[i];

    if ("shortest" === mode) return solveWithPriority(n, startCode, goalCode, moves, pows, "shortest", timeoutMs);
    if ("shortest-fast" === mode) return solveFastShortestMoves(n, startCode, goalCode, moves, pows, timeoutMs);
    if ("fewer-switches-fast" === mode) return solveFastFewerPlateSwitches(n, startCode, goalCode, moves, pows, timeoutMs);
    return solveWithPriority(n, startCode, goalCode, moves, pows, "fewer-switches", timeoutMs);
};