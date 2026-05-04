import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
    selector: 'app-page-error',
    templateUrl: './page-error.component.html',
    styleUrls: ['./page-error.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PageErrorComponent implements OnInit {
    constructor(
        private activatedRoute: ActivatedRoute,
        private cd: ChangeDetectorRef) {}

    code = 0;
    codeToMessage = {
        404: 'This game link appears to have expired. You can always start a new one!',
        500: 'Something went wrong...'
    };

    ngOnInit(): void {
        this.activatedRoute.paramMap.subscribe(value => {
            this.code = Number(value.get('code')) || 500;
            this.cd.markForCheck();
        });
    }

}
