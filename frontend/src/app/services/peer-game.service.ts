import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import Peer from 'peerjs';
import { DataConnection } from 'peerjs';
import { Side } from '../../../../server/src/model/agent_side';
import { GameEventKind } from '../../../../server/src/model/game_log_item';
import { P2PCard, P2PGameState, P2PMessage, P2PRole } from './p2p-types';
import { WORD_LISTS } from '../core/p2p-word-lists';

// ─── Tiny helpers (replaces server-side shuffle-array / generate_id) ──────────

function randomInt(max: number) {
    return Math.floor(Math.random() * max);
}

function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickRandom<T>(arr: T[], n: number): T[] {
    return shuffleArray(arr).slice(0, n);
}

function generateRoomId(): string {
    return 'cn-' + Math.random().toString(36).slice(2, 9);
}

// ─── Board generation ─────────────────────────────────────────────────────────

const BOARD_SIZE = 25;

function generateBoard(wordListIndex: number): P2PCard[] {
    const list = WORD_LISTS[wordListIndex] || WORD_LISTS[0];
    const words = pickRandom(list.words, BOARD_SIZE);

    // Determine first-move side (gets +1 card)
    const firstSide: Side = Math.random() > 0.5 ? Side.RED : Side.BLUE;
    const sides: Side[] = [
        ...Array(8).fill(Side.NEUTRAL),
        ...Array(1).fill(Side.ASSASSIN),
        ...Array(firstSide === Side.RED ? 9 : 8).fill(Side.RED),
        ...Array(firstSide === Side.BLUE ? 9 : 8).fill(Side.BLUE),
    ];
    const shuffledSides = shuffleArray(sides);

    return words.map((name, i) => ({
        index: i,
        name,
        side: shuffledSides[i],
        uncovered: false,
    }));
}

function countLeft(board: P2PCard[], side: Side): number {
    return board.filter(c => c.side === side && !c.uncovered).length;
}

function buildInitialState(wordListIndex: number, gameInChain: number): P2PGameState {
    const board = generateBoard(wordListIndex);
    const firstSide = board.filter(c => c.side === Side.RED).length === 9 ? Side.RED : Side.BLUE;
    return {
        board,
        move: { hint: '', count: 0, side: firstSide, isFinished: false, isInited: false },
        redLeft: countLeft(board, Side.RED),
        blueLeft: countLeft(board, Side.BLUE),
        isFinished: false,
        log: [],
        gameInChain,
    };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PeerGameService implements OnDestroy {

    // ── Public state ──────────────────────────────────────────────────────────

    /** Current game state (null until connected/started). */
    game$ = new BehaviorSubject<P2PGameState | null>(null);

    /** Our PeerJS peer ID (set once the peer opens). */
    localPeerId$ = new BehaviorSubject<string | null>(null);

    /** Whether we are the host (source of truth). */
    isHost = false;

    /** Local role chosen by this player. Not synced. */
    role: P2PRole = 'operative';

    /** True once connected to the host (or hosting with ≥1 joiner). */
    connected$ = new BehaviorSubject(false);

    /** Error messages to surface to the UI. */
    error$ = new Subject<string>();

    /** Connection status label for display. */
    status$ = new BehaviorSubject<string>('idle');

    // ── Private state ─────────────────────────────────────────────────────────

    private peer: Peer | null = null;
    private hostConn: DataConnection | null = null;       // Joiner → Host
    private guestConns: DataConnection[] = [];             // Host → Joiners
    private currentWordListIndex = 0;
    private gameInChain = 1;

    // ─────────────────────────────────────────────────────────────────────────
    // Public API – called from lobby/board components
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * HOST: Initialise a PeerJS peer.
     * After `peer.on('open')` fires, the caller can read `localPeerId$`.
     */
    initAsHost(wordListIndex: number, role: P2PRole) {
        this.isHost = true;
        this.role = role;
        this.currentWordListIndex = wordListIndex;
        this.status$.next('opening');
        this.destroyPeer();

        const roomId = generateRoomId();
        this.peer = new Peer(roomId);

        this.peer.on('open', (id) => {
            this.localPeerId$.next(id);
            this.status$.next('waiting');
            // Generate the board so the host can see it right away.
            const state = buildInitialState(wordListIndex, this.gameInChain);
            this.game$.next(state);
        });

        this.peer.on('connection', (conn) => {
            this.guestConns.push(conn);
            this.connected$.next(true);
            this.setupGuestConn(conn);
        });

        this.peer.on('error', (err) => {
            console.error('[PeerGameService] peer error', err);
            this.error$.next(`PeerJS error: ${err.message ?? err}`);
        });
    }

    /**
     * JOINER: Connect to the host's peer ID.
     */
    joinAsGuest(hostPeerId: string, role: P2PRole) {
        this.isHost = false;
        this.role = role;
        this.status$.next('connecting');
        this.destroyPeer();

        this.peer = new Peer();

        this.peer.on('open', () => {
            this.hostConn = this.peer!.connect(hostPeerId, { reliable: true });

            this.hostConn.on('open', () => {
                this.connected$.next(true);
                this.status$.next('connected');
            });

            this.hostConn.on('data', (raw) => {
                this.onMessageFromHost(raw as P2PMessage);
            });

            this.hostConn.on('error', (err) => {
                console.error('[PeerGameService] conn error', err);
                this.error$.next(`Connection error: ${err.message ?? err}`);
            });

            this.hostConn.on('close', () => {
                this.connected$.next(false);
                this.status$.next('disconnected');
            });
        });

        this.peer.on('error', (err) => {
            console.error('[PeerGameService] peer error', err);
            this.error$.next(`PeerJS error: ${err.message ?? err}`);
        });
    }

    /**
     * OPERATIVE (any side): Reveal a card by index.
     * Host applies the move locally; joiners send a message to the host.
     */
    revealCard(cardIndex: number) {
        if (this.isHost) {
            this.applyRevealCard(cardIndex);
            this.broadcastState();
        } else {
            this.sendToHost({ type: 'reveal_card', cardIndex });
        }
    }

    /**
     * SPYMASTER (any side): Commit a hint.
     * Host applies locally; joiners send a message to the host.
     */
    sendHint(hint: string, count: number) {
        if (this.isHost) {
            this.applyHint(hint, count);
            this.broadcastState();
        } else {
            this.sendToHost({ type: 'send_hint', hint, count });
        }
    }

    /**
     * OPERATIVE: End the current team's guessing turn.
     */
    endTurn() {
        if (this.isHost) {
            this.applyEndTurn();
            this.broadcastState();
        } else {
            this.sendToHost({ type: 'end_turn' });
        }
    }

    /**
     * HOST only: Start a new game (new board, same word list).
     */
    newGame(wordListIndex?: number) {
        if (!this.isHost) return;
        if (wordListIndex !== undefined) this.currentWordListIndex = wordListIndex;
        this.gameInChain += 1;
        const state = buildInitialState(this.currentWordListIndex, this.gameInChain);
        this.game$.next(state);
        this.broadcastState();
    }

    /** Reset to idle (navigate away). */
    reset() {
        this.destroyPeer();
        this.game$.next(null);
        this.localPeerId$.next(null);
        this.connected$.next(false);
        this.status$.next('idle');
        this.gameInChain = 1;
        this.isHost = false;
    }

    ngOnDestroy() {
        this.destroyPeer();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private – game logic (Host only)
    // ─────────────────────────────────────────────────────────────────────────

    private applyRevealCard(cardIndex: number) {
        const state = this.game$.value;
        if (!state) return;

        const card = state.board[cardIndex];
        const moveAllowed = state.move.isInited && !state.move.isFinished;
        if (!card || card.uncovered || state.isFinished || !moveAllowed) return;

        card.uncovered = true;
        state.move.count -= 1;

        state.log.push({ kind: GameEventKind.AgentUncovered, side: card.side, index: cardIndex });

        if (card.side === Side.BLUE)  state.blueLeft -= 1;
        if (card.side === Side.RED)   state.redLeft  -= 1;

        if (card.side !== state.move.side || state.move.count <= 0) {
            state.move.isFinished = true;
        }

        const assassinated = card.side === Side.ASSASSIN;
        const teamWon = state.redLeft === 0 || state.blueLeft === 0;

        if (assassinated || teamWon) {
            state.move.isFinished = true;
            state.isFinished = true;
            const sideWinner = assassinated
                ? (state.move.side === Side.RED ? Side.BLUE : Side.RED)
                : (state.redLeft === 0 ? Side.RED : Side.BLUE);
            state.log.push({ kind: GameEventKind.GameFinished, sideWinner });
        }

        this.game$.next({ ...state, board: [...state.board] });
    }

    private applyHint(hint: string, count: number) {
        const state = this.game$.value;
        if (!state || state.isFinished) return;

        const nextSide = state.move.isInited
            ? (state.move.side === Side.BLUE ? Side.RED : Side.BLUE)
            : state.move.side;

        // count=0 means "unlimited" (codenames rule: 0 → boardSize)
        const resolvedCount = count === 0 ? BOARD_SIZE : count + 1;

        state.move = { hint, side: nextSide, count: resolvedCount, isInited: true, isFinished: false };
        state.log.push({ kind: GameEventKind.SpymasterHint, hint, side: nextSide, count });

        this.game$.next({ ...state });
    }

    private applyEndTurn() {
        const state = this.game$.value;
        if (!state || !state.move.isInited || state.move.isFinished) return;
        state.move.isFinished = true;
        this.game$.next({ ...state });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private – PeerJS plumbing
    // ─────────────────────────────────────────────────────────────────────────

    private setupGuestConn(conn: DataConnection) {
        conn.on('open', () => {
            // Send current state to the newly connected peer.
            this.sendStateTo(conn);
        });

        conn.on('data', (raw) => {
            this.onMessageFromGuest(raw as P2PMessage, conn);
        });

        conn.on('close', () => {
            this.guestConns = this.guestConns.filter(c => c !== conn);
            if (this.guestConns.length === 0) {
                this.connected$.next(false);
                this.status$.next('waiting');
            }
        });

        conn.on('error', (err) => {
            console.error('[PeerGameService] guest conn error', err);
        });
    }

    private onMessageFromGuest(msg: P2PMessage, _conn: DataConnection) {
        switch (msg.type) {
            case 'reveal_card': this.applyRevealCard(msg.cardIndex); this.broadcastState(); break;
            case 'send_hint':   this.applyHint(msg.hint, msg.count); this.broadcastState(); break;
            case 'end_turn':    this.applyEndTurn();                  this.broadcastState(); break;
        }
    }

    private onMessageFromHost(msg: P2PMessage) {
        if (msg.type === 'state_update') {
            this.game$.next(msg.state);
        }
    }

    private broadcastState() {
        const state = this.game$.value;
        if (!state) return;
        const msg: P2PMessage = { type: 'state_update', state };
        for (const conn of this.guestConns) {
            if (conn.open) conn.send(msg);
        }
    }

    private sendStateTo(conn: DataConnection) {
        const state = this.game$.value;
        if (!state) return;
        const msg: P2PMessage = { type: 'state_update', state };
        if (conn.open) conn.send(msg);
    }

    private sendToHost(msg: P2PMessage) {
        if (this.hostConn?.open) {
            this.hostConn.send(msg);
        }
    }

    private destroyPeer() {
        if (this.peer) {
            try { this.peer.destroy(); } catch { /* ignore */ }
            this.peer = null;
        }
        this.hostConn = null;
        this.guestConns = [];
    }
}
