import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { PlayerType } from '../../../server/src/api/player_type';

/**
 * To simplify refactoring and reusing different application
 * navigation routes, all the routes formatting in one place.
 */
@Injectable()
export class AppRoutingNavigationService {
    constructor(private router: Router) {}

    toStart() {
        this.router.navigate(['start']);
    }

    toNewGame() {
        this.router.navigate(['game/new']);
    }

    toRules() {
        this.router.navigate(['rules']);
    }

    toJoinGame(gameId: string) {
        this.router.navigate(['game', gameId, 'join']);
    }

    toGameBoard(gameId: string, playerType: PlayerType) {
        this.router.navigate(['game', gameId, 'player', playerType, 'board']);
    }

    toP2PLobby() {
        this.router.navigate(['p2p', 'lobby']);
    }

    toP2PBoard() {
        this.router.navigate(['p2p', 'board']);
    }

    toError(code: number) {
        this.router.navigate(['error', code]);
    }


    getJoinLink(gameId: string) {
        return `${window.location.origin}/game/${gameId}/join`;
    }
}
