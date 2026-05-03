import { GameEvent } from '../../../../server/src/model/game_log_item';
import { GameMove } from '../../../../server/src/model/game_move';
import { Side } from '../../../../server/src/model/agent_side';

/** A single card on the P2P board. */
export interface P2PCard {
    index: number;
    name: string;
    /** Real team assignment – always synced (honour system). */
    side: Side;
    uncovered: boolean;
}

/** Complete game state broadcast from Host to all peers. */
export interface P2PGameState {
    board: P2PCard[];
    move: GameMove;
    redLeft: number;
    blueLeft: number;
    isFinished: boolean;
    log: GameEvent[];
    gameInChain: number;
}

/** Wire messages exchanged over PeerJS data channels. */
export type P2PMessage =
    | { type: 'state_update'; state: P2PGameState }
    | { type: 'reveal_card'; cardIndex: number }
    | { type: 'send_hint'; hint: string; count: number }
    | { type: 'end_turn' };

export type P2PRole = 'spymaster' | 'operative';
