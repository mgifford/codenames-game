import { Location } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AppRoutingNavigationService } from '../../app-routing-navigation.service';
import { PeerGameService } from '../../services/peer-game.service';
import { P2PRole } from '../../services/p2p-types';
import { WORD_LISTS, WordList } from '../../core/p2p-word-lists';

@Component({
    selector: 'app-page-p2p-lobby',
    templateUrl: './page-p2p-lobby.component.html',
    styleUrls: ['./page-p2p-lobby.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageP2PLobbyComponent implements OnInit, OnDestroy {

    constructor(
        private peerService: PeerGameService,
        private navigation: AppRoutingNavigationService,
        private location: Location,
        private cd: ChangeDetectorRef) {}

    // ── UI state ──────────────────────────────────────────────────────────────

    /** 'host' | 'join' tab */
    activeTab: 'host' | 'join' = 'host';

    // Host flow
    wordLists: WordList[] = WORD_LISTS;
    selectedWordListIndex = 0;
    hostRole: P2PRole = 'spymaster';
    hostStatus = '';
    peerId: string | null = null;
    hostWaiting = false;
    hostReady = false;   // board generated, waiting for joiners

    // Join flow
    peerIdControl = new FormControl('', [Validators.required, Validators.minLength(3)]);
    joinRole: P2PRole = 'operative';
    joinStatus = '';
    joinConnecting = false;

    private destroy$ = new Subject<void>();

    // ─────────────────────────────────────────────────────────────────────────

    ngOnInit() {
        // Reset any previous session
        this.peerService.reset();

        this.peerService.localPeerId$
            .pipe(takeUntil(this.destroy$))
            .subscribe(id => {
                this.peerId = id;
                if (id) {
                    this.hostStatus = 'Комната создана. Поделитесь ID с другими игроками.';
                    this.hostReady = true;
                }
                this.cd.markForCheck();
            });

        this.peerService.connected$
            .pipe(takeUntil(this.destroy$))
            .subscribe(connected => {
                if (connected && !this.peerService.isHost) {
                    // Joiner connected – navigate to board
                    this.navigation.toP2PBoard();
                }
                this.cd.markForCheck();
            });

        this.peerService.error$
            .pipe(takeUntil(this.destroy$))
            .subscribe(msg => {
                if (this.peerService.isHost) {
                    this.hostStatus = `Ошибка: ${msg}`;
                    this.hostWaiting = false;
                } else {
                    this.joinStatus = `Ошибка: ${msg}`;
                    this.joinConnecting = false;
                }
                this.cd.markForCheck();
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ── Host actions ──────────────────────────────────────────────────────────

    onCreateRoomClick() {
        this.hostStatus = 'Открываем комнату…';
        this.hostWaiting = true;
        this.peerService.initAsHost(this.selectedWordListIndex, this.hostRole);
    }

    onHostStartGameClick() {
        this.navigation.toP2PBoard();
    }

    // ── Join actions ──────────────────────────────────────────────────────────

    onJoinClick() {
        if (this.peerIdControl.invalid) return;
        const hostId = this.peerIdControl.value.trim();
        this.joinStatus = 'Подключаемся…';
        this.joinConnecting = true;
        this.peerService.joinAsGuest(hostId, this.joinRole);
    }

    // ── Misc ──────────────────────────────────────────────────────────────────

    onBackClick() {
        this.peerService.reset();
        this.location.back();
    }

    copyPeerId() {
        if (this.peerId) {
            navigator.clipboard.writeText(this.peerId).catch(() => {});
        }
    }
}
