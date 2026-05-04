import { Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DictionaryDescription } from '../../../../server/src/api/dictionary_description';
import { DictionariesService } from './dictionaries.service';

/**
 * Used to pre-fetch dictionaries before navigate to some route
 */
@Injectable()
export class DictionariesResolve implements Resolve<DictionaryDescription[]> {
    constructor(
        private dictionariesService: DictionariesService,
        private snackBar: MatSnackBar) {
    }

    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
        return this.dictionariesService.getDictionaries()
            .pipe(catchError(err => {
                this.snackBar.open('Something went wrong: Failed to create game', 'Dismiss');
                return throwError(err);
            }));
    }
}
