import {
    AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef,
    Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { Side } from '../../../../../server/src/model/agent_side';
import { GameEventKind } from '../../../../../server/src/model/game_log_item';
import { AppRoutingNavigationService } from '../../app-routing-navigation.service';
import { PeerGameService } from '../../services/peer-game.service';
import { P2PGameState, P2PRole } from '../../services/p2p-types';
import { NewGameConfirmPopupComponent } from '../page-board/new-game-confirm-popup/new-game-confirm-popup.component';

interface LogEntry {
    text: string;
    side: Side;
    count?: number;
    isHint: boolean;
}

@Component({
    selector: 'app-page-p2p-board',
    templateUrl: './page-p2p-board.component.html',
    styleUrls: ['./page-p2p-board.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageP2PBoardComponent implements OnInit, OnDestroy, AfterViewInit {

    constructor(
        public peerService: PeerGameService,
        private navigation: AppRoutingNavigationService,
        private snackBar: MatSnackBar,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef) {}

    @ViewChild('container') boardView: ElementRef<HTMLDivElement>;

    // ── Game state ────────────────────────────────────────────────────────────

    game: P2PGameState | null = null;
    cardFontSize = 0;

    // ── Role / identity ───────────────────────────────────────────────────────

    /** Local, non-synced role. Controls whether card colours are shown. */
    get isSpymaster(): boolean { return this.peerService.role === 'spymaster'; }
    get isHost(): boolean      { return this.peerService.isHost; }

    // ── Hint input (spymasters only) ──────────────────────────────────────────

    hintControl = new FormControl('');
    hintCountControl = new FormControl(1);

    // ── Log display ───────────────────────────────────────────────────────────

    log: LogEntry[][] = [];

    // ── Side constants for template ───────────────────────────────────────────

    SIDE_UNKNOWN   = Side.UNKNOWN;
    SIDE_RED       = Side.RED;
    SIDE_BLUE      = Side.BLUE;
    SIDE_ASSASSIN  = Side.ASSASSIN;
    SIDE_NEUTRAL   = Side.NEUTRAL;

    private destroy$ = new Subject<void>();

    // ─────────────────────────────────────────────────────────────────────────

    ngOnInit() {
        this.peerService.game$
            .pipe(
                takeUntil(this.destroy$),
                filter(s => s !== null))
            .subscribe(state => {
                this.game = state;
                this.updateLog();
                if (state!.isFinished) {
                    this.snackBar.open(
                        'Игра завершена! Нажмите «Новая игра» чтобы сыграть ещё.',
                        'Супер!');
                }
                this.cd.markForCheck();
            });

        this.peerService.error$
            .pipe(takeUntil(this.destroy$))
            .subscribe(msg => {
                this.snackBar.open(`Ошибка соединения: ${msg}`, 'Ок', { duration: 5000 });
                this.cd.markForCheck();
            });
    }

    ngOnDestroy() {
        this.snackBar.dismiss();
        this.destroy$.next();
        this.destroy$.complete();
    }

    ngAfterViewInit() {
        this.onBoardResized();
    }

    @HostListener('window:resize')
    onBoardResized() {
        if (!this.boardView?.nativeElement) return;
        this.cardFontSize = (this.boardView.nativeElement.offsetWidth - 16 * 2 - 8 * 4) / 5 * 0.1;
        this.cd.detectChanges();
    }

    // ── Board rendering helpers ───────────────────────────────────────────────

    /**
     * Returns the side to display for a card.
     * Operatives only see the colour once it has been uncovered.
     */
    displaySide(cardIndex: number): Side {
        if (!this.game) return Side.UNKNOWN;
        const card = this.game.board[cardIndex];
        if (this.isSpymaster || card.uncovered) return card.side;
        return Side.UNKNOWN;
    }

    cardTrackBy(index: number) { return index; }

    // ── Player actions ────────────────────────────────────────────────────────

    onCardClick(index: number) {
        if (!this.game) return;
        if (this.isSpymaster) return;                         // spymasters don't click cards
        if (!this.game.move.isInited)  return;                // wait for a hint first
        if (this.game.move.isFinished) return;                // turn is over
        if (this.game.isFinished)      return;
        this.peerService.revealCard(index);
    }

    onSendHintClick() {
        const hint = this.hintControl.value?.trim();
        const count = Number(this.hintCountControl.value) || 0;
        if (!hint) return;
        this.peerService.sendHint(hint, count);
        this.hintControl.reset('');
        this.hintCountControl.reset(1);
        this.cd.markForCheck();
    }

    onEndTurnClick() {
        this.peerService.endTurn();
    }

    onNewGameClick() {
        if (!this.isHost) {
            this.snackBar.open('Только хост может начать новую игру.', 'Ок', { duration: 3000 });
            return;
        }
        if (this.game?.isFinished) {
            this.peerService.newGame();
        } else {
            const dialogRef = this.dialog.open(NewGameConfirmPopupComponent, {});
            dialogRef.afterClosed().subscribe(val => {
                if (val === 1) this.peerService.newGame();
            });
        }
    }

    onLeaveClick() {
        this.peerService.reset();
        this.navigation.toStart();
    }

    onHelpClick() {
        this.navigation.toRules();
    }

    // ── Log ───────────────────────────────────────────────────────────────────

    private updateLog() {
        this.log = [];
        if (!this.game) return;

        for (const item of this.game.log) {
            if (item.kind === GameEventKind.SpymasterHint) {
                this.log.unshift([{ text: item.hint, side: item.side, count: item.count, isHint: true }]);
            } else if (item.kind === GameEventKind.AgentUncovered) {
                if (this.log.length === 0) this.log.push([]);
                this.log[0].push({
                    text: this.game.board[item.index]?.name ?? '?',
                    side: item.side,
                    isHint: false
                });
            }
        }
    }

    // ── Template helpers ──────────────────────────────────────────────────────

    get nextHintSide(): Side {
        if (!this.game) return Side.RED;
        return this.game.move.isInited
            ? (this.game.move.side === Side.BLUE ? Side.RED : Side.BLUE)
            : this.game.move.side;
    }

    get canSendHint(): boolean {
        if (!this.game || !this.isSpymaster) return false;
        // Spymaster can send a hint when the previous move has been resolved
        return !this.game.isFinished && (!this.game.move.isInited || this.game.move.isFinished);
    }

    get canEndTurn(): boolean {
        if (!this.game || this.isSpymaster) return false;
        return this.game.move.isInited && !this.game.move.isFinished && !this.game.isFinished;
    }

    get roleLabel(): string {
        return this.isSpymaster ? 'Капитан' : 'Игрок';
    }

    get connectionBadge(): string {
        return this.isHost ? 'Хост' : 'Гость';
    }
}
