import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PageBoardComponent } from './components/page-board/page-board.component';
import { PageErrorComponent } from './components/page-error/page-error.component';
import { PageJoinComponent } from './components/page-join/page-join.component';
import { PageNewGameComponent } from './components/page-new-game/page-new-game.component';
import { PageP2PBoardComponent } from './components/page-p2p-board/page-p2p-board.component';
import { PageP2PLobbyComponent } from './components/page-p2p-lobby/page-p2p-lobby.component';
import { PageRulesComponent } from './components/page-rules/page-rules.component';
import { PageStartComponent } from './components/page-start/page-start.component';
import { DictionariesResolve } from './services/dictionaries.resolve';

const routes: Routes = [
    { path: '', redirectTo: 'p2p/lobby', pathMatch: 'full' },
    { path: 'start', redirectTo: 'p2p/lobby', pathMatch: 'full' },
    { path: 'rules', component: PageRulesComponent },
    {
        path: 'game/new',
        component: PageNewGameComponent,
        resolve: {
            dictionaries: DictionariesResolve
        }
    },
    { path: 'game/:gameId', redirectTo: 'game/:gameId/join', pathMatch: 'full' },
    { path: 'game/:gameId/join', component: PageJoinComponent },
    { path: 'game/:gameId/player/:playerType/board', component: PageBoardComponent },
    { path: 'p2p/lobby', component: PageP2PLobbyComponent },
    { path: 'p2p/board', component: PageP2PBoardComponent },
    { path: 'error/:code', component: PageErrorComponent },
    { path: '**', redirectTo: 'start' }
];

@NgModule({
    imports: [
        RouterModule.forRoot(routes, { enableTracing: false })
    ],
    exports: [
        RouterModule
    ]
})
export class AppRoutingModule {
}
