import { Component } from '@angular/core';

@Component({
    selector: 'app-root',
    template: `
        <a href="#main-content" class="skip-link">Перейти к содержимому</a>
        <main id="main-content">
            <router-outlet></router-outlet>
        </main>
    `
})
export class AppComponent {
}
